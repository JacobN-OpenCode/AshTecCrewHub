import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, isStaff, ids } from '../lib/server';
import { one } from '../lib/presence';

/**
 * Ticket 168e8274: the full timeline of one venue check-in session.
 *
 * Returns the session header, every logged event (sign in, sign out, decline,
 * open, close) with the member and the admin who decided it, and the final
 * roster. The live page reuses this with the active session id to show a single
 * member's timeline when you tap them, so one shape serves both the backlog and
 * the live view.
 *
 * Readable by staff as well as admins, matching the live roster.
 */
export default createEndpoint({
  description: 'Returns one venue check-in session with its full event timeline and roster (admins and staff)',
  authenticated: true,
  inputSchema: z.object({ sessionId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    if (!me.isAdmin && !isStaff(me)) throw new Error('This history is available to admins and staff only.');

    const session = await zite.presenceSessions.findOne({ id: input.sessionId });
    if (!session) throw new Error('That session no longer exists.');

    const [sub, rows, events, members] = await Promise.all([
      one(session.subEvent) ? zite.subEvents.findOne({ id: one(session.subEvent) }) : Promise.resolve(undefined),
      zite.venuePresence.findAll({ filters: { session: session.id }, limit: 2000 }),
      zite.venuePresenceEvents.findAll({ filters: { session: session.id }, limit: 20000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);
    const memById = new Map(members.records.map((m) => [m.id, m]));
    const nameOf = (id?: string) => {
      const m = id ? memById.get(id) : undefined;
      return m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || 'Unknown' : '';
    };

    return {
      session: {
        id: session.id,
        title: sub?.title ?? 'Venue session',
        type: sub?.type ?? '',
        date: sub?.date ?? null,
        status: session.status ?? 'Active',
        startedAt: session.startedAt ?? null,
        endedAt: session.endedAt ?? null,
        startedByName: nameOf(ids(session.startedBy)[0]),
        endedByName: nameOf(ids(session.endedBy)[0]),
      },
      events: events.records
        .map((e) => {
          const memberId = one(e.member) ?? '';
          return {
            id: e.id,
            memberId,
            memberName: memberId ? nameOf(memberId) : '',
            action: e.action ?? '',
            reasonLabel: e.reasonLabel ?? '',
            reason: e.reason ?? '',
            comingBack: !!e.comingBack,
            expectedBackAt: e.expectedBackAt ?? null,
            at: e.at ?? null,
            byName: nameOf(one(e.by)),
          };
        })
        .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')),
      roster: rows.records.map((r) => {
        const memberId = one(r.member) ?? '';
        const m = memById.get(memberId);
        return {
          memberId,
          name: m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || 'Unknown' : 'Unknown',
          year: m?.year ?? '',
          roles: m?.roles ?? [],
          state: r.state ?? null,
          signedInAt: r.signedInAt ?? null,
          signedOutAt: r.signedOutAt ?? null,
        };
      }),
    };
  },
});
