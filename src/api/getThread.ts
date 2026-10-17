import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db, zite } from '#db';
import { requireMember, mapMember } from '../lib/server';

/**
 * One DM thread (Batch 7): every message between the caller and one other
 * member, oldest first. Opening a thread marks the messages waiting for the
 * caller as read, so the unread badge clears. Scoped to the caller's own pairs.
 */
export default createEndpoint({
  description: 'A direct-message thread between the caller and one other member',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string(), limit: z.number().int().min(1).max(500).optional() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const other = input.memberId;
    if (other === me.id) throw new Error('You cannot message yourself.');

    const member = await zite.crewMembers.findOne({ id: other });
    if (!member) throw new Error('That member could not be found.');
    const m = mapMember(member);

    const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
    const { rows } = await db().query(
      `SELECT "id", "from", "to", "body", "createdAt", "readAt"
         FROM "DirectMessages"
        WHERE ("from" = $1 AND "to" = $2) OR ("from" = $2 AND "to" = $1)
        ORDER BY "createdAt" ASC
        LIMIT $3`,
      [me.id, other, limit]
    );

    // Mark what they sent me as read now that I have opened it (idempotent).
    await db().query(
      `UPDATE "DirectMessages" SET "readAt" = now()
        WHERE "to" = $1 AND "from" = $2 AND "readAt" IS NULL`,
      [me.id, other]
    );

    return {
      member: {
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim() || m.email,
        avatarUrl: m.avatarUrl ?? '',
        year: m.year ?? '',
      },
      messages: rows.map((r) => ({
        id: String(r.id),
        fromMe: String(r.from) === me.id,
        body: (r.body as string) ?? '',
        at: (r.createdAt as string) ?? '',
      })),
    };
  },
});
