import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';
import { requireMember } from '../lib/server';

/**
 * The member's recent pushes (Batch 6: notification history), newest first.
 *
 * Read straight from the NotificationHistory table this member's own pushes
 * were recorded into, so a member who was offline can see what they missed.
 * Scoped to the caller: there is no way to ask for anyone else's history.
 */
export default createEndpoint({
  description: 'The signed-in member’s recent push notification history',
  authenticated: true,
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const { rows } = await db().query(
      `SELECT "id", "kind", "title", "body", "url", "sentAt"
         FROM "NotificationHistory"
        WHERE "member" = $1
        ORDER BY "sentAt" DESC
        LIMIT $2`,
      [me.id, limit]
    );
    return {
      items: rows.map((r) => ({
        id: r.id as string,
        kind: (r.kind as string) ?? '',
        title: (r.title as string) ?? '',
        body: (r.body as string) ?? '',
        url: (r.url as string) ?? '/',
        sentAt: r.sentAt as string,
      })),
    };
  },
});
