import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/**
 * What Admin -> MCP needs in one call: whether the server is on, which admin
 * the tools act as, the keys that exist (never the keys themselves, only what
 * they start with), and the most recent calls.
 */
export default createEndpoint({
  description: 'MCP server status, keys and recent calls (admins)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    enabled: z.boolean(),
    envToken: z.boolean(),
    actor: z.object({ name: z.string(), email: z.string() }),
    url: z.string(),
    keys: z.array(z.any()),
    logs: z.array(z.any()),
    toolCount: z.number(),
    callsToday: z.number(),
    failuresToday: z.number(),
  }),
  async execute({ context }) {
    const me = await requireAdmin(context.user!.email);

    // The same order server/mcp.ts uses, so the tab never claims a different
    // admin from the one the tools actually run as.
    const wanted = (process.env.MCP_EMAIL ?? '').trim();
    const query = wanted
      ? 'SELECT "firstName", "lastName", "schoolEmail" FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1) AND "isAdmin" = true LIMIT 1'
      : 'SELECT "firstName", "lastName", "schoolEmail" FROM "CrewMembers" WHERE "isAdmin" = true AND "isPreviewAccount" = false ORDER BY "createdAt" LIMIT 1';
    const { rows: actorRows } = await zite.sql({ query, params: wanted ? [wanted] : [] });
    const actorRow = actorRows[0];

    const [keyRows, logRows] = await Promise.all([
      zite.mcpKeys.findAll({ limit: 100 }),
      zite.mcpCallLog.findAll({ limit: 120 }),
    ]);

    const enabledKeys = keyRows.records.filter((k) => k.enabled);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = logRows.records.filter((l) => new Date(String(l.createdAt)).getTime() >= dayStart.getTime());

    return {
      enabled: enabledKeys.length > 0 || !!(process.env.MCP_TOKEN ?? '').trim(),
      envToken: !!(process.env.MCP_TOKEN ?? '').trim(),
      actor: {
        name: actorRow ? `${actorRow.firstName ?? ''} ${actorRow.lastName ?? ''}`.trim() : 'no admin found',
        email: String(actorRow?.schoolEmail ?? ''),
      },
      url: `${(process.env.APP_URL ?? 'https://ashtec.dino.icu').replace(/\/$/, '')}/mcp`,
      keys: keyRows.records
        .map((k) => ({
          id: String(k.id),
          name: String(k.name ?? ''),
          prefix: String(k.prefix ?? ''),
          enabled: !!k.enabled,
          createdAt: String(k.createdAt ?? ''),
          lastUsedAt: String(k.lastUsedAt ?? ''),
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      logs: logRows.records
        .map((l) => ({
          id: String(l.id),
          keyName: String(l.keyName ?? ''),
          method: String(l.method ?? ''),
          tool: String(l.tool ?? ''),
          ok: !!l.ok,
          detail: String(l.detail ?? ''),
          ms: Number(l.ms ?? 0),
          at: String(l.createdAt ?? ''),
        }))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 60),
      toolCount: 8,
      callsToday: today.length,
      failuresToday: today.filter((l) => !l.ok).length,
    };
  },
});
