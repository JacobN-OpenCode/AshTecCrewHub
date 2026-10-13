import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * Ticket 36b8cfd8: clear the venue check-in session backlog.
 *
 * The Session backlog on /admin/attendance grows forever - every past session
 * with its sign-in/out timeline stays listed. Admins asked for a way to empty
 * it. This deletes every non-Active session plus the VenuePresence rows and
 * VenuePresenceEvents timeline entries that belong to it. The single Active
 * session (and its live roster) is left untouched, so clearing the backlog can
 * never disturb people who are currently checked in.
 */
export default createEndpoint({
  description: 'Deletes all past venue check-in sessions and their presence history (admins only)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    sessions: z.number(),
    presence: z.number(),
    events: z.number(),
  }),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    if (!me.isAdmin) throw new Error('Only admins can clear the session backlog.');

    // Collect the finished session ids first, then delete children, then the
    // sessions themselves. Deleting by explicit id list keeps the Active
    // session - and its roster - out of the blast radius.
    const { rows: finished } = await zite.sql({
      query: `SELECT "id" FROM "PresenceSessions" WHERE COALESCE("status", 'Active') <> 'Active'`,
    });
    const sessionIds = finished.map((r) => r.id as string);
    if (!sessionIds.length) return { sessions: 0, presence: 0, events: 0 };

    const { rows: presence } = await zite.sql({
      query: `DELETE FROM "VenuePresence" WHERE "session" = ANY($1::uuid[]) RETURNING "id"`,
      params: [sessionIds],
    });
    const { rows: events } = await zite.sql({
      query: `DELETE FROM "VenuePresenceEvents" WHERE "session" = ANY($1::uuid[]) RETURNING "id"`,
      params: [sessionIds],
    });
    const { rows: sessions } = await zite.sql({
      query: `DELETE FROM "PresenceSessions" WHERE "id" = ANY($1::uuid[]) RETURNING "id"`,
      params: [sessionIds],
    });

    return { sessions: sessions.length, presence: presence.length, events: events.length };
  },
});
