import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { DECK_ID, requireDeckToken } from '../lib/server';

/**
 * The Audio Deck desktop app polls this every 3 seconds. Status and audio-update
 * events go up (events are deduped by the deck's own monotonic seq, so the deck
 * can resend until it sees lastSeq); pending admin control requests and queued
 * play/pause/skip commands come back down. Commands are read-and-cleared, so a
 * deck only ever executes each one once.
 */
export default createEndpoint({
  description: 'Audio Deck app poll: pushes status + audio updates, receives control requests and commands',
  authenticated: false, // the desktop app has no CrewHub session - the shared token gates it
  inputSchema: z.object({
    token: z.string(),
    status: z.object({
      playing: z.boolean(),
      trackName: z.string().nullable(),
      queueCount: z.number(),
      autoPlay: z.boolean(),
      appVersion: z.string().optional(),
    }),
    events: z.array(z.object({ seq: z.number(), message: z.string() })).optional(),
  }),
  outputSchema: z.object({
    lastSeq: z.number(),
    requests: z.array(z.object({ id: z.string(), requestedBy: z.string(), createdAt: z.string() })),
    commands: z.array(z.object({ action: z.string() })),
  }),
  execute: async ({ input }) => {
    requireDeckToken(input.token);

    const { rows: stateRows } = await zite.sql({
      query: 'SELECT "lastEventSeq" FROM "AudioDeckState" WHERE "deckId" = $1',
      params: [DECK_ID],
    });
    const lastSeq = Number(stateRows[0]?.lastEventSeq ?? 0);

    // Append only events the hub has not stored yet (the deck resends its
    // unacked tail every poll, so a dropped response costs nothing).
    const fresh = (input.events ?? []).filter((e) => e.seq > lastSeq).sort((a, b) => a.seq - b.seq);
    for (const e of fresh) {
      await zite.sql({
        query: 'INSERT INTO "AudioDeckEvents" ("deckId", "seq", "message") VALUES ($1, $2, $3)',
        params: [DECK_ID, e.seq, e.message.slice(0, 300)],
      });
    }
    const maxSeq = fresh.length ? fresh[fresh.length - 1].seq : lastSeq;

    await zite.sql({
      query:
        'INSERT INTO "AudioDeckState" ("deckId", "status", "lastEventSeq", "updatedAt") VALUES ($1, $2, $3, now())' +
        ' ON CONFLICT ("deckId") DO UPDATE SET "status" = $2,' +
        ' "lastEventSeq" = GREATEST("AudioDeckState"."lastEventSeq", $3), "updatedAt" = now()',
      params: [DECK_ID, JSON.stringify(input.status), maxSeq],
    });

    // A request the operator never answered expires after a minute so the deck
    // and the hub agree it is dead without another round trip.
    await zite.sql({
      query: `UPDATE "AudioDeckControl" SET "status" = 'expired' WHERE "status" = 'pending' AND "createdAt" < now() - interval '60 seconds'`,
      params: [],
    });
    const { rows: reqRows } = await zite.sql({
      query:
        'SELECT "id", "requestedBy", "createdAt" FROM "AudioDeckControl"' +
        ` WHERE "deckId" = $1 AND "status" = 'pending' ORDER BY "createdAt" ASC`,
      params: [DECK_ID],
    });

    const { rows: cmdRows } = await zite.sql({
      query: 'SELECT "pendingCommands" FROM "AudioDeckState" WHERE "deckId" = $1',
      params: [DECK_ID],
    });
    const commands = Array.isArray(cmdRows[0]?.pendingCommands) ? cmdRows[0].pendingCommands : [];
    if (commands.length) {
      await zite.sql({
        query: `UPDATE "AudioDeckState" SET "pendingCommands" = '[]'::jsonb WHERE "deckId" = $1`,
        params: [DECK_ID],
      });
    }

    return {
      lastSeq: maxSeq,
      requests: reqRows.map((r: any) => ({ id: String(r.id), requestedBy: String(r.requestedBy ?? ''), createdAt: String(r.createdAt) })),
      commands: commands.map((c: any) => ({ action: String(c?.action ?? '') })).filter((c: any) => c.action),
    };
  },
});
