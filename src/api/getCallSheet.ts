import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, mapMember, mapSubEvent, ids } from '../lib/server';

/**
 * A printable call sheet for one show (Batch 6): each event with its date,
 * meeting/start/end times and the crew called to it, so a stage manager can
 * print one page and pin it up on a show day.
 *
 * Members-only; hidden shows stay invisible to everyone but staff and admins,
 * the same rule as the show workspace. Crew rows come from attendance (the
 * per-event truth), with the member's role for context.
 */
export default createEndpoint({
  description: 'Printable call sheet for a show: events and the crew called to each',
  authenticated: true,
  inputSchema: z.object({ showId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const { mapped } = await requireShowAccess(context.user.email, input.showId);

    const [subs, members, att] = await Promise.all([
      zite.subEvents.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.attendance.findAll({ limit: 5000 }),
    ]);

    const memberById = new Map(
      members.records
        .filter((m) => !m.isPreviewAccount)
        .map((m) => {
          const mm = mapMember(m);
          const role = mm.roles[0] ?? mm.preferredRole1 ?? '';
          return [m.id, { id: m.id, name: `${mm.firstName}${mm.lastName ? ' ' + mm.lastName : ''}`.trim() || mm.email, role }] as const;
        })
    );

    const events = subs.records
      .filter((e) => ids(e.shows).includes(input.showId))
      .map(mapSubEvent)
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

    const byEvent = (eid: string) =>
      att.records
        .filter((a) => ids(a.subEvent)[0] === eid)
        // "Not Attending" / "Not Attending Event" is the whole point of a call
        // sheet: those people are explicitly not called.
        .filter((a) => !(a.status ?? '').startsWith('Not Attending'))
        .map((a) => {
          const m = memberById.get(ids(a.member)[0] ?? '');
          return { name: m?.name ?? '', role: m?.role ?? '', status: a.status ?? '' };
        })
        .filter((c) => c.name)
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
      show: mapped,
      generatedAt: new Date().toISOString(),
      eventCount: events.length,
      events: events.map((e) => ({ ...e, crew: byEvent(e.id) })),
    };
  },
});
