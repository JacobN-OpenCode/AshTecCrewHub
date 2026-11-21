import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db, zite } from '#db';
import { requireAdmin } from '../lib/server';

/**
 * Reads the activity log for the "Logs" popup on Server diagnostics.
 *
 * One row per HTTP request plus one per SPA page view (method 'view'). Rows are
 * newest-first with keyset pagination: the cursor is "<at>|<id>", and the next
 * page returns only rows strictly older than it, so a page cannot miss rows
 * that arrive between two fetches.
 *
 * Filtering is intentionally light (member, text-in-path, view/api, authorised,
 * date window): admins, who are the only people who can open this, can already
 * read the whole log, so this is about narrowing a trace, not sandboxing it.
 */

const cursor = (at: string, id: string) => `${at}|${id}`;
export const parseCursor = (c: string): { at: string; id: string } | null => {
  const i = c.indexOf('|');
  if (i < 0) return null;
  const at = c.slice(0, i);
  const id = c.slice(i + 1);
  return at && id ? { at, id } : null;
};

export default createEndpoint({
  description: 'Returns rows from the activity log, newest first, with filters (admins)',
  authenticated: true,
  inputSchema: z.object({
    memberEmail: z.string().optional(),
    pathContains: z.string().optional(),
    method: z.enum(['view', 'api']).optional(),
    authorized: z.enum(['yes', 'no']).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);

    const limit = input.limit ?? 100;
    const clauses: string[] = [];
    const params: unknown[] = [];
    const q = (col: string, op: string, v: unknown) => {
      params.push(v);
      clauses.push(`r."${col}" ${op} $${params.length}`);
    };

    if (input.memberEmail) q('email', '=', input.memberEmail.toLowerCase());
    if (input.pathContains?.trim()) {
      params.push(`%${input.pathContains.trim()}%`);
      clauses.push(`r."path" ILIKE $${params.length}`);
    }
    if (input.method === 'view') clauses.push(`r."method" = 'view'`);
    if (input.method === 'api') clauses.push(`r."method" <> 'view'`);
    if (input.authorized === 'yes') clauses.push(`r."authorized" = true`);
    if (input.authorized === 'no') clauses.push(`r."authorized" = false`);
    if (input.from) q('at', '>=', new Date(input.from).toISOString());
    if (input.to) q('at', '<=', new Date(input.to).toISOString());

    const start = parseCursor(input.cursor ?? '');
    if (start) {
      params.push(start.at, start.id);
      clauses.push(`(r."at" < $${params.length - 1} OR (r."at" = $${params.length - 1} AND r."id" < $${params.length}))`);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await db().query(
      `SELECT r."id", r."at", r."method", r."path", r."status", r."latencyMs",
              r."viewSeconds", r."authorized", r."email", r."ip", r."userAgent", r."referer"
         FROM "RequestLogs" r${where}
        ORDER BY r."at" DESC, r."id" DESC
        LIMIT $${params.length + 1}`,
      [...params, limit + 1]
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    return {
      rows: page.map((r) => ({
        id: r.id as string,
        at: (r.at as string) ?? '',
        method: r.method ?? '',
        path: r.path ?? '',
        status: r.status ? Number(r.status) : 0,
        latencyMs: r.latencyMs ? Number(r.latencyMs) : 0,
        viewSeconds: r.viewSeconds ? Number(r.viewSeconds) : 0,
        authorized: !!r.authorized,
        email: r.email ?? '',
        ip: r.ip ?? '',
        userAgent: r.userAgent ?? '',
        referer: r.referer ?? '',
      })),
      nextCursor: hasMore && last ? cursor(last.at as string, last.id as string) : null,
      members: members
        .map((m) => ({
          id: m.id as string,
          email: (m.schoolEmail ?? '') as string,
          name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || (m.schoolEmail ?? ''),
        }))
        .filter((m) => m.email),
    };
  },
});