import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, isStaff, ids } from '../lib/server';

/**
 * Ticket 168e8274: the backlog of venue check-in sessions.
 *
 * Lists every session newest-first with enough to tell them apart at a glance:
 * which event, when it ran, who opened and closed it, how many people were
 * checked in, and how many timeline events it holds. The detail (who signed in
 * and out, and who approved it) lives in adminGetSessionDetail.
 *
 * Readable by staff as well as admins, matching the live roster.
 */
export default createEndpoint({
  description: 'Lists venue check-in sessions with a summary of each (admins and staff)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    if (!me.isAdmin && !isStaff(me)) throw new Error('This history is available to admins and staff only.');

    const [sessions, subs, members, events] = await Promise.all([
      zite.presenceSessions.findAll({ limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.venuePresenceEvents.findAll({ limit: 20000 }),
    ]);
    const subById = new Map(subs.records.map((s) => [s.id, s]));
    const memById = new Map(members.records.map((m) => [m.id, m]));
    const nameOf = (id?: string) => {
      const m = id ? memById.get(id) : undefined;
      return m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || '' : '';
    };

    const eventCount = new Map<string, number>();
    const checkedIn = new Map<string, Set<string>>();
    for (const e of events.records) {
      const sid = ids(e.session)[0];
      if (!sid) continue;
      eventCount.set(sid, (eventCount.get(sid) ?? 0) + 1);
      // Count anyone who ever signed in during the session, not just whoever is
      // still On Site at the end.
      const mid = ids(e.member)[0];
      if (mid && e.action === 'Sign In') {
        const set = checkedIn.get(sid) ?? new Set<string>();
        set.add(mid);
        checkedIn.set(sid, set);
      }
    }

    return {
      sessions: sessions.records
        .map((s) => {
          const sub = subById.get(ids(s.subEvent)[0] ?? '');
          return {
            id: s.id,
            title: sub?.title ?? 'Venue session',
            type: sub?.type ?? '',
            date: sub?.date ?? null,
            status: s.status ?? 'Active',
            startedAt: s.startedAt ?? null,
            endedAt: s.endedAt ?? null,
            startedByName: nameOf(ids(s.startedBy)[0]),
            endedByName: nameOf(ids(s.endedBy)[0]),
            checkedIn: checkedIn.get(s.id)?.size ?? 0,
            eventCount: eventCount.get(s.id) ?? 0,
          };
        })
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')),
    };
  },
});
