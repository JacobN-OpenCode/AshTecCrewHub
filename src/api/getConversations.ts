import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db, zite } from '#db';
import { requireMember, mapMember } from '../lib/server';

/**
 * The signed-in member's DM conversation list (Batch 7): one row per person
 * they have exchanged messages with, newest thread first, with the last message
 * and an unread count. Scoped to the caller - there is no way to list anyone
 * else's conversations.
 */
export default createEndpoint({
  description: 'The signed-in member’s direct-message conversations',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);

    // Last message per counterpart (DISTINCT ON keeps it to one row each).
    const { rows: lastRows } = await db().query(
      `SELECT DISTINCT ON (other) other, body, "createdAt", "from"
         FROM (
           SELECT CASE WHEN "from" = $1 THEN "to" ELSE "from" END AS other,
                  "body", "createdAt", "from"
             FROM "DirectMessages"
            WHERE "from" = $1 OR "to" = $1
         ) t
        ORDER BY other, "createdAt" DESC`,
      [me.id]
    );

    const { rows: unreadRows } = await db().query(
      `SELECT "from" AS other, COUNT(*)::int AS unread
         FROM "DirectMessages"
        WHERE "to" = $1 AND "readAt" IS NULL
        GROUP BY "from"`,
      [me.id]
    );
    const unreadBy = new Map(unreadRows.map((r) => [String(r.other), Number(r.unread)]));

    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    const byId = new Map(members.map((m) => [String(m.id), mapMember(m)]));

    const conversations = lastRows
      .map((r) => {
        const m = byId.get(String(r.other));
        return {
          memberId: String(r.other),
          name: m ? `${m.firstName} ${m.lastName}`.trim() || m.email : 'Former member',
          avatarUrl: m?.avatarUrl ?? '',
          year: m?.year ?? '',
          lastBody: (r.body as string) ?? '',
          lastAt: (r.createdAt as string) ?? '',
          lastFromMe: String(r.from) === me.id,
          unread: unreadBy.get(String(r.other)) ?? 0,
        };
      })
      .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

    const unreadTotal = conversations.reduce((n, c) => n + c.unread, 0);
    return { conversations, unreadTotal };
  },
});
