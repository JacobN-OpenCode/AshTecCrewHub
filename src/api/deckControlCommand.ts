import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { DECK_ID, requireAdmin } from '../lib/server';

/**
 * Queues a command for the deck. Only allowed while an approved control window
 * is open (the operator granted it and it has not expired yet) - so an admin
 * can nudge play/pause/skip during a show, but never drive the deck unasked.
 */
export default createEndpoint({
  description: 'Admin: queue a play/pause/skip command while a control window is active',
  authenticated: true,
  inputSchema: z.object({ action: z.enum(['play', 'pause', 'skip']) }),
  outputSchema: z.object({ queued: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user!.email);

    const { rows: win } = await zite.sql({
      query: `SELECT "id" FROM "AudioDeckControl" WHERE "deckId" = $1 AND "status" = 'approved' AND "expiresAt" > now() LIMIT 1`,
      params: [DECK_ID],
    });
    if (!win.length) {
      throw new ZiteError({
        code: 'FORBIDDEN',
        message: 'No active control window. Request control and have the operator approve it first.',
        userFacingMessage: 'No active control window - request control first.',
      });
    }

    const { rows: state } = await zite.sql({
      query: 'SELECT "deckId" FROM "AudioDeckState" WHERE "deckId" = $1',
      params: [DECK_ID],
    });
    if (!state.length) {
      throw new ZiteError({ code: 'NOT_FOUND', message: 'The Audio Deck has not checked in yet.', userFacingMessage: 'The Audio Deck is offline.' });
    }

    await zite.sql({
      query: `UPDATE "AudioDeckState" SET "pendingCommands" = "pendingCommands" || $2::jsonb, "updatedAt" = now() WHERE "deckId" = $1`,
      params: [DECK_ID, JSON.stringify([{ action: input.action }])],
    });
    return { queued: true };
  },
});
