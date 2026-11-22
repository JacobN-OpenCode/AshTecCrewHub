import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { DECK_ID, requireDeckToken } from '../lib/server';

/**
 * The operator clicks Approve or Deny on the deck laptop. Approving opens the
 * 2-minute window during which the admin's deckControlCommand calls are allowed.
 */
export default createEndpoint({
  description: 'Audio Deck app answers a pending control request (approve opens a 2-minute window)',
  authenticated: false,
  inputSchema: z.object({
    token: z.string(),
    requestId: z.string(),
    approved: z.boolean(),
  }),
  outputSchema: z.object({ success: z.boolean(), approved: z.boolean() }),
  execute: async ({ input }) => {
    requireDeckToken(input.token);
    const status = input.approved ? 'approved' : 'denied';
    const { rows } = await zite.sql({
      query:
        'UPDATE "AudioDeckControl" SET "status" = $2, "resolvedAt" = now(),' +
        ` "expiresAt" = CASE WHEN $2 = 'approved' THEN now() + interval '2 minutes' ELSE NULL END` +
        ` WHERE "id" = $1 AND "status" = 'pending' AND "deckId" = $3 RETURNING "id"`,
      params: [input.requestId, status, DECK_ID],
    });
    if (!rows.length) {
      throw new ZiteError({ code: 'NOT_FOUND', message: 'That request is no longer waiting for an answer.' });
    }
    return { success: true, approved: input.approved };
  },
});
