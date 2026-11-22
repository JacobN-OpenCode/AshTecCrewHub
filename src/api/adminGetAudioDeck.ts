import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { DECK_ID, requireAdmin } from '../lib/server';

/** Everything the admin Audio Deck tab renders, in one poll. */
export default createEndpoint({
  description: 'Admin: Audio Deck tab data (live status, control state, recent audio updates)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    online: z.boolean(),
    state: z.object({ status: z.any(), updatedAt: z.string().nullable() }),
    control: z.object({
      pending: z.object({ id: z.string(), requestedBy: z.string(), createdAt: z.string() }).nullable(),
      approved: z.object({ until: z.string() }).nullable(),
    }),
    events: z.array(z.object({ seq: z.number(), message: z.string(), createdAt: z.string() })),
  }),
  execute: async ({ context }) => {
    await requireAdmin(context.user!.email);

    await zite.sql({
      query: `UPDATE "AudioDeckControl" SET "status" = 'expired', "resolvedAt" = now() WHERE "deckId" = $1 AND "status" = 'pending' AND "createdAt" < now() - interval '60 seconds'`,
      params: [DECK_ID],
    });

    const { rows: stateRows } = await zite.sql({
      query: 'SELECT "status", "updatedAt" FROM "AudioDeckState" WHERE "deckId" = $1',
      params: [DECK_ID],
    });
    const state = stateRows[0];
    const updatedAt = state?.updatedAt ? String(state.updatedAt) : null;
    // The deck polls every 3s; anything staler than 15s means the laptop is
    // closed, asleep, or the app is not running.
    const online = !!updatedAt && Date.now() - Date.parse(updatedAt) < 15000;

    const { rows: ctrlRows } = await zite.sql({
      query:
        'SELECT "id", "status", "requestedBy", "createdAt", "expiresAt" FROM "AudioDeckControl"' +
        ` WHERE "deckId" = $1 AND "status" IN ('pending', 'approved') ORDER BY "createdAt" DESC LIMIT 5`,
      params: [DECK_ID],
    });
    const pendingRow = ctrlRows.find((r: any) => r.status === 'pending');
    const approvedRow = ctrlRows.find((r: any) => r.status === 'approved' && r.expiresAt && Date.parse(String(r.expiresAt)) > Date.now());

    const { rows: eventRows } = await zite.sql({
      query: 'SELECT "seq", "message", "createdAt" FROM "AudioDeckEvents" WHERE "deckId" = $1 ORDER BY "createdAt" DESC, "seq" DESC LIMIT 40',
      params: [DECK_ID],
    });

    return {
      online,
      state: { status: state?.status ?? null, updatedAt },
      control: {
        pending: pendingRow
          ? { id: String(pendingRow.id), requestedBy: String(pendingRow.requestedBy ?? ''), createdAt: String(pendingRow.createdAt) }
          : null,
        approved: approvedRow ? { until: String(approvedRow.expiresAt) } : null,
      },
      events: eventRows.map((e: any) => ({ seq: Number(e.seq), message: String(e.message), createdAt: String(e.createdAt) })),
    };
  },
});
