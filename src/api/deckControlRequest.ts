import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { DECK_ID, requireAdmin } from '../lib/server';

/**
 * Admin side of temporary control. "request" files a pending request that the
 * deck shows to the operator (expires unanswered after 60s); "cancel" withdraws
 * anything still pending.
 */
export default createEndpoint({
  description: 'Admin: request or cancel temporary control of the Audio Deck',
  authenticated: true,
  inputSchema: z.object({ action: z.enum(['request', 'cancel']) }),
  outputSchema: z.object({
    requested: z.boolean(),
    request: z.object({ id: z.string(), requestedBy: z.string(), createdAt: z.string() }).nullable(),
  }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user!.email);

    await zite.sql({
      query: `UPDATE "AudioDeckControl" SET "status" = 'expired', "resolvedAt" = now() WHERE "deckId" = $1 AND "status" = 'pending'`,
      params: [DECK_ID],
    });
    if (input.action === 'cancel') return { requested: false, request: null };

    const name = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'An admin';
    const { rows } = await zite.sql({
      query:
        'INSERT INTO "AudioDeckControl" ("deckId", "status", "requestedBy") VALUES ($1, \'pending\', $2)' +
        ' RETURNING "id", "requestedBy", "createdAt"',
      params: [DECK_ID, name],
    });
    const r = rows[0];
    return {
      requested: true,
      request: { id: String(r.id), requestedBy: String(r.requestedBy), createdAt: String(r.createdAt) },
    };
  },
});
