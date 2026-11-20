/**
 * A small MCP server, mounted at POST /mcp on the same Express app.
 *
 * Why here instead of a separate process: the crew hub already owns the
 * database, the endpoint schemas and the admin checks. Anything else would be a
 * second copy of the rules that could drift, and a second thing to keep alive on
 * the school server. This file is deliberately tiny: it authenticates a bearer
 * token, then hands tool calls to the same endpoints the browser calls, so an
 * MCP client can only do what that admin could do in the app.
 *
 * Security model, in full:
 *
 *   - Off unless MCP_TOKEN is set in the environment. No token, no route (503),
 *     so a forgotten deploy cannot expose anything.
 *   - Compared with timingSafeEqual over sha256 digests, so the comparison does
 *     not leak the token's length or content.
 *   - Each key acts as the admin who made it (McpKeys.memberId). A key made
 *     before that column existed, or the MCP_TOKEN environment token, falls back
 *     to MCP_EMAIL and then to the first admin in the crew list. Never
 *     anonymous: every call is an admin's call, and admin-only endpoints stay
 *     admin-only.
 *   - Tools are a short, named list. There is no "call any endpoint" tool, so the
 *     token cannot be turned into a general-purpose SQL or filesystem client.
 *   - Reads are capped (see `MAX_TEXT`) so a big response cannot be used to
 *     stream the whole database out in one call.
 *   - Every call is rate limited per IP and logged to the server log.
 *
 * Writes are limited to the live show chat, replying to a support ticket and
 * closing one. Not done on purpose: member create/delete, settings, and anything
 * that emails the whole crew. Those are one careless tool call away from
 * annoying 40 people, and they are easy to add later if they are ever actually
 * wanted.
 */

import type { Express, Request, Response } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { createHash, timingSafeEqual } from 'crypto';
import { zite } from '#db';
import * as rateLimit from './rateLimit.js';
import type { EndpointConfig } from './backend.js';
import { openLiveShow, loadLiveShowScenes, loadLiveShowMessages, mapLiveShow } from '../src/lib/liveShow.js';

type AnyEndpoint = EndpointConfig<any, any, any, any> & { name: string };
type Endpoints = Map<string, AnyEndpoint>;

const MAX_TEXT = 16000;
const PROTOCOL = '2025-06-18';

const token = () => (process.env.MCP_TOKEN ?? '').trim();

function digest(s: string) {
  return createHash('sha256').update(s).digest();
}

/** Bearer token from the request, or '' when there isn't one. */
function bearer(req: Request) {
  const header = String(req.headers.authorization ?? '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

/** Compare two hex digests without leaking where they differ. */
function sameHash(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

/** Which key is making the call in flight, so the tools know who they act as. */
type KeyInfo = { name: string; id: string; memberId: string };
const currentKey = new AsyncLocalStorage<KeyInfo>();

/**
 * Keys made in Admin -> MCP (table McpKeys) are the normal way in. The
 * MCP_TOKEN environment variable still works, so a server set up before the tab
 * existed keeps going.
 *
 * Returns the name to log the call under, or null when nothing matches.
 */
async function matchKey(req: Request): Promise<KeyInfo | null> {
  const given = bearer(req);
  if (!given) return null;

  const env = token();
  if (env && timingSafeEqual(digest(given), digest(env))) return { name: 'environment token', id: '', memberId: '' };

  let keys: any[] = [];
  try {
    keys = (await zite.mcpKeys.findAll({ filters: { enabled: true }, limit: 200 })).records;
  } catch {
    return null;
  }
  const hash = createHash('sha256').update(given).digest('hex');
  for (const k of keys) {
    const stored = String(k.tokenHash ?? '');
    if (!stored || stored.length !== hash.length) continue;
    if (!sameHash(hash, stored)) continue;
    // Awaited, so the admin tab shows the use it just had rather than trailing one call behind.
    await zite.mcpKeys.update({ id: String(k.id), record: { lastUsedAt: new Date().toISOString() } }).catch(() => {});
    return { name: String(k.name ?? 'unnamed key'), id: String(k.id), memberId: String(k.memberId ?? '') };
  }
  return null;
}

/** Is the server switched on at all: an enabled key, or the env token. */
async function mcpOn() {
  if (token()) return true;
  try {
    const keys = await zite.mcpKeys.findAll({ filters: { enabled: true }, limit: 1 });
    return keys.records.length > 0;
  } catch {
    return false;
  }
}

/** One row per call, for the log on Admin -> MCP. Best effort, never throws. */
async function logCall(keyName: string, method: string, tool: string, ok: boolean, detail: string, ms: number) {
  try {
    await zite.mcpCallLog.create({
      record: {
        keyName: keyName.slice(0, 80),
        method: method.slice(0, 60),
        tool: tool.slice(0, 80),
        ok,
        detail: detail.slice(0, 400),
        ms: Math.min(Math.max(Math.round(ms), 0), 600000),
      },
    });
  } catch {
    // A logging failure must never fail the call itself.
  }
}

const actorCache = new Map<string, { id: string; email: string; name: string }>();

/**
 * The admin this call runs as: the member the key belongs to, else MCP_EMAIL,
 * else the first admin. Cached per member, so a key made by one admin never
 * borrows another admin's name.
 */
async function actor() {
  const key = currentKey.getStore();
  const byId = (key?.memberId ?? '').trim();
  const wanted = (process.env.MCP_EMAIL ?? '').trim();
  const cacheKey = byId ? `id:${byId}` : `env:${wanted.toLowerCase()}`;
  const hit = actorCache.get(cacheKey);
  if (hit) return hit;

  const query = byId
    ? 'SELECT "id", "schoolEmail", "firstName", "lastName" FROM "CrewMembers" WHERE "id" = $1 AND "isAdmin" = true LIMIT 1'
    : wanted
      ? 'SELECT "id", "schoolEmail", "firstName", "lastName" FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1) AND "isAdmin" = true LIMIT 1'
      : 'SELECT "id", "schoolEmail", "firstName", "lastName" FROM "CrewMembers" WHERE "isAdmin" = true AND "isPreviewAccount" = false ORDER BY "createdAt" LIMIT 1';
  const { rows } = await zite.sql({ query, params: byId ? [byId] : wanted ? [wanted] : [] });
  const row = rows[0];
  if (!row) {
    throw new Error(
      byId
        ? 'This key is set to act as a crew member who is not an admin any more. Make a new key in Admin -> MCP.'
        : wanted
          ? `MCP_EMAIL is ${wanted}, which is not an admin in the crew list.`
          : 'No admin exists yet, so there is nobody for the tools to run as.',
    );
  }
  const found = {
    id: String(row.id),
    email: String(row.schoolEmail ?? ''),
    name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || 'Admin',
  };
  actorCache.set(cacheKey, found);
  return found;
}

/** Run an endpoint the way the browser would, as the MCP admin. */
async function call(byName: Endpoints, name: string, input: unknown) {
  const ep = byName.get(name);
  if (!ep) throw new Error(`The crew hub has no endpoint called ${name}.`);
  const parsed = ep.inputSchema ? ep.inputSchema.parse(input ?? {}) : (input ?? {});
  const me = await actor();
  const context = { user: { id: me.id, email: me.email }, requestId: 'mcp' };
  return ep.execute({ input: parsed, context } as never);
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });

/** The short version of an open show, shared by the overview and live_show tools. */
async function describeLiveShow(show: Awaited<ReturnType<typeof openLiveShow>>) {
  if (!show) return null;
  const mapped = mapLiveShow(show);
  return {
    name: mapped.name,
    status: mapped.status,
    scene: mapped.currentSceneIndex,
    scenes: (await loadLiveShowScenes(show.id)).length,
  };
}

const TOOLS = [
  {
    name: 'crew_hub_overview',
    description:
      'What the crew hub looks like right now: the open live show (if any), the next few sessions, and how many support tickets are open. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (byName: Endpoints) => {
      const [register, live, support] = await Promise.all([
        call(byName, 'adminGetRegister', {}),
        openLiveShow(),
        call(byName, 'adminGetSupport', {}),
      ]);
      // Today, in the same local-date form the sub-events use, so "next" means
      // next: the picker also holds everything that has already happened.
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const events = ((register as any)?.events ?? [])
        .filter((e: any) => !!e.date && !e.dateTbc && e.date >= today)
        .slice(0, 8)
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          startTime: e.startTime,
          type: e.type,
          shows: e.showNames ?? [],
          mode: e.mode,
        }));
      const tickets = ((support as any)?.tickets ?? []) as any[];
      return {
        actor: (await actor()).name,
        // The show that is actually open, not merely the last one anyone
        // touched, so this agrees with the live_show tool.
        liveShow: live ? await describeLiveShow(live) : null,
        nextSessions: events,
        openTickets: tickets.filter((t) => !/closed|resolved/i.test(String(t.status))).length,
        waitingOnUs: tickets.filter((t) => t.maintainerTurn).length,
      };
    },
  },
  {
    name: 'list_sessions',
    description: 'Every session on the schedule that can be checked in to: shows, rehearsals and club sessions, with dates and types.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (byName: Endpoints) => {
      const r: any = await call(byName, 'adminGetRegister', {});
      return { sessions: r?.events ?? [], openSession: r?.openSession ?? null };
    },
  },
  {
    name: 'get_register',
    description:
      'The register for one session: who is in (green), away with a reason (yellow) and not in with a reason (red), plus who has not been marked yet.',
    inputSchema: {
      type: 'object',
      properties: { subEventId: str('Session id from list_sessions. Leave out for the session that is open now.') },
      additionalProperties: false,
    },
    run: async (byName: Endpoints, args: any) => {
      const r: any = await call(byName, 'adminGetRegister', args.subEventId ? { subEventId: args.subEventId } : {});
      return {
        mode: r?.mode,
        event: r?.event ?? null,
        counts: r?.counts ?? null,
        members: (r?.members ?? []).map((m: any) => ({
          name: m.name,
          year: m.year,
          roles: m.roles,
          state: m.state,
          reason: m.reason || null,
        })),
      };
    },
  },
  {
    name: 'list_tickets',
    description: 'Support tickets, newest first, with status, severity and whether each one is waiting on a maintainer.',
    inputSchema: {
      type: 'object',
      properties: { openOnly: { type: 'boolean', description: 'Only tickets that are not closed (default true).' } },
      additionalProperties: false,
    },
    run: async (byName: Endpoints, args: any) => {
      const r: any = await call(byName, 'adminGetSupport', {});
      const openOnly = args.openOnly !== false;
      const rows = ((r?.tickets ?? []) as any[])
        .filter((t) => (openOnly ? !/closed|resolved/i.test(String(t.status)) : true))
        .map((t) => ({
          id: t.id,
          subject: t.subject,
          type: t.type,
          severity: t.severity,
          status: t.status,
          submitted: t.submittedAt,
          replies: t.replyCount,
          waitingOnMaintainer: !!t.maintainerTurn,
        }));
      return { tickets: rows.slice(0, 50), total: rows.length };
    },
  },
  {
    name: 'find_member',
    description: 'Look a crew member up by name (or part of it) and get their year, roles and member type. No email addresses.',
    inputSchema: {
      type: 'object',
      properties: { query: str('Name or part of a name, e.g. "patel".') },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (_byName: Endpoints, args: any) => {
      const q = String(args.query ?? '').trim().toLowerCase();
      if (q.length < 2) throw new Error('Give at least two letters to search for.');
      const { records } = await zite.crewMembers.findAll({ limit: 2000 });
      const hits = records
        .filter((m) => !m.isPreviewAccount)
        .filter((m) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.toLowerCase().includes(q))
        .slice(0, 20)
        .map((m) => ({
          id: m.id,
          name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
          year: m.year,
          roles: m.roles ?? [],
          memberType: m.memberType,
          isAdmin: !!m.isAdmin,
        }));
      return { query: q, matches: hits, total: hits.length };
    },
  },
  {
    name: 'live_show',
    description: 'The live show board: status, which scene is on, the running order and the last few crew chat messages.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      // Read straight from the show, not through getLiveShowState: that one only
      // hands back scenes and chat to a registered screen, so an MCP client would
      // always get an empty board.
      const liveShow = await openLiveShow();
      if (!liveShow) return { liveShow: null, scenes: [], messages: [], note: 'No live show is open.' };
      const scenes = await loadLiveShowScenes(liveShow.id);
      return {
        liveShow: mapLiveShow(liveShow),
        sceneOnNow: scenes[Number((liveShow as any).currentSceneIndex ?? 0)] ?? null,
        scenes: scenes.map((s: any) => ({ label: s.label, title: s.title, minutes: s.minutes, cast: s.cast ?? [] })),
        messages: (await loadLiveShowMessages(liveShow.id)).slice(-10).map((m: any) => ({ author: m.authorName, body: m.body, at: m.createdAt })),
      };
    },
  },
  {
    name: 'send_live_show_chat',
    description: 'Post a message to the crew chat that every backstage screen shows. Signed with the given name.',
    inputSchema: {
      type: 'object',
      properties: {
        body: str('The message. 500 characters at most.'),
        as: str('Optional name to sign it with, e.g. "Stage manager". Defaults to the admin the token runs as.'),
      },
      required: ['body'],
      additionalProperties: false,
    },
    run: async (byName: Endpoints, args: any) => {
      const body = String(args.body ?? '').trim();
      if (!body) throw new Error('Write something first.');
      const r: any = await call(byName, 'liveShowChat', {
        body,
        ...(args.as ? { screenName: String(args.as) } : {}),
      });
      return { sent: true, message: r?.message ?? null };
    },
  },
  {
    name: 'reply_to_ticket',
    description:
      'Reply to a support ticket. The reply is emailed to the person who raised it and recorded on the thread. Signed "gorkie" unless you pass as.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: str('Ticket id from list_tickets.'),
        message: str('What to say. Plain text, up to 4000 characters.'),
        as: str('Name to sign the reply with. Defaults to "gorkie".'),
      },
      required: ['ticketId', 'message'],
      additionalProperties: false,
    },
    run: async (byName: Endpoints, args: any) => {
      const message = String(args.message ?? '').trim();
      if (!message) throw new Error('Write the reply first.');
      const asName = String(args.as ?? 'gorkie').trim() || 'gorkie';
      const r: any = await call(byName, 'adminReplyTicket', {
        id: String(args.ticketId ?? ''),
        message,
        asName,
      });
      return { sent: !!r?.sent, signedAs: asName, messageId: r?.messageId ?? '' };
    },
  },
  {
    name: 'close_ticket',
    description:
      'Close or resolve a support ticket, with an optional private note on the thread. Closing emails nobody.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: str('Ticket id from list_tickets.'),
        status: str('"Closed" (the default) or "Resolved".'),
        note: str('Optional private note for the thread. Not emailed.'),
        as: str('Name the status change is recorded under. Defaults to "gorkie".'),
      },
      required: ['ticketId'],
      additionalProperties: false,
    },
    run: async (byName: Endpoints, args: any) => {
      const id = String(args.ticketId ?? '');
      if (!id) throw new Error('Which ticket?');
      const status = String(args.status ?? 'Closed');
      if (status !== 'Closed' && status !== 'Resolved') throw new Error('Status has to be Closed or Resolved.');
      const note = String(args.note ?? '').trim();
      const asName = String(args.as ?? 'gorkie').trim() || 'gorkie';
      if (note) await call(byName, 'adminNoteTicket', { id, message: note });
      await call(byName, 'adminUpdateTicket', { id, status, asName });
      return { ok: true, ticketId: id, status };
    },
  },
  {
    name: 'clear_live_show_chat',
    description: 'Delete the whole live show chat. Announcements are not touched. This cannot be undone.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (byName: Endpoints) => {
      const r: any = await call(byName, 'liveShowClearChat', {});
      return { cleared: r?.cleared ?? 0 };
    },
  },
];

function text(value: unknown) {
  const body = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}\n…truncated. Ask for something narrower.` : body;
}

type Rpc = { id?: string | number | null; method?: string; params?: any };

async function handle(byName: Endpoints, req: Request, key: KeyInfo) {
  const msg = (Array.isArray(req.body) ? req.body[0] : req.body) as Rpc;
  const id = msg?.id ?? null;
  const method = String(msg?.method ?? '');
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'initialize') {
    const asked = msg?.params?.protocolVersion;
    return reply({
      protocolVersion: typeof asked === 'string' ? asked : PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'ashtec-crew-hub', version: '1.0.0' },
      instructions:
        'Tools for the AshTec crew hub: read the schedule, registers, tickets and live show, post or clear the live show chat, and reply to or close a support ticket. Register colours: green = in, yellow = away with a reason, red = not in with a reason.',
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
  if (method === 'ping') return reply({});
  if (method === 'tools/list') {
    return reply({
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (method === 'tools/call') {
    const name = String(msg?.params?.name ?? '');
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return fail(-32602, `No tool called ${name}. Try tools/list.`);
    try {
      const result = await currentKey.run(key, () => tool.run(byName, msg?.params?.arguments ?? {}));
      return reply({ content: [{ type: 'text', text: text(result) }], isError: false });
    } catch (e: any) {
      return reply({ content: [{ type: 'text', text: e?.message ?? 'That did not work.' }], isError: true });
    }
  }
  return fail(-32601, `Unsupported method ${method}.`);
}

export function mountMcp(app: Express, byName: Endpoints) {
  app.all('/mcp', async (req: Request, res: Response) => {
    if (!(await mcpOn())) {
      return res.status(503).json({
        error: 'The crew hub MCP server is switched off. Make a key in Admin -> MCP, or set MCP_TOKEN on the server.',
      });
    }
    if (!rateLimit.allow(`mcp:${req.ip ?? 'unknown'}`, 120, 60_000)) {
      return res.status(429).json({ error: 'Too many MCP calls. Wait a minute.' });
    }
    const key = await matchKey(req);
    if (!key) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="ashtec-crew-hub"');
      return res.status(401).json({ error: 'Send Authorization: Bearer <key>. Copy it from Admin -> MCP.' });
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      // Enough of a handshake for clients that probe the URL before posting.
      return res.status(405).json({ error: 'This MCP server takes JSON-RPC over POST /mcp.' });
    }
    try {
      const started = Date.now();
      const method = String(req.body?.method ?? '');
      const tool = method === 'tools/call' ? String(req.body?.params?.name ?? '') : '';
      const out = await handle(byName, req, key);
      if (method && method !== 'ping') {
        const message = (out as any)?.error?.message ?? '';
        void logCall(key.name, method, tool, !(out as any)?.error, message, Date.now() - started);
      }
      if (!out) return res.status(202).end();
      console.log(`[mcp] ${method || 'unknown'} ok (${key.name})`);
      return res.json(out);
    } catch (e: any) {
      console.error('[mcp] failed:', e);
      const method = String(req.body?.method ?? '');
      void logCall(key.name, method, String(req.body?.params?.name ?? ''), false, e?.message ?? 'MCP call failed.', 0);
      return res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e?.message ?? 'MCP call failed.' } });
    }
  });
}
