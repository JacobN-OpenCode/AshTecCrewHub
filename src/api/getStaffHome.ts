import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, isStaff, ids, mapMember, todayIso } from '../lib/server';

/**
 * The staff homepage: a countdown to the next event, the upcoming events, and
 * the crew roster with each student's attendance answer per event. Staff do not
 * respond to event forms or show forms, so none of that appears here - this is
 * the "who is coming and when" view an adult in the room actually needs.
 *
 * Students are everyone who is not staff and not a preview puppet. Admins see
 * the same page: they run the roster too, and the rest of admin tools still
 * live under /admin.
 */

export default createEndpoint({
  description: 'Staff home: next event countdown, upcoming events and each student’s attendance',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    if (!isStaff(me) && !me.isAdmin) throw new Error('Staff only.');
    const today = todayIso();

    const [shows, subs, att, members] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.attendance.findAll({ limit: 5000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);

    const students = members.records
      .filter((m) => !isStaff(m) && !m.isPreviewAccount)
      .map((m) => mapMember(m))
      .sort((a, b) => (a.firstName ?? '').localeCompare(b.firstName ?? ''));

    const studentIds = new Set(students.map((s) => s.id));
    const hiddenShowIds = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));

    const upcoming = subs.records
      .filter((e) => !e.hidden && !(e.shows?.length && ids(e.shows).every((id) => hiddenShowIds.has(id))))
      .filter((e) => !e.date || e.date >= today)
      .map((e) => {
        const showIds = ids(e.shows);
        const statuses = att.records.filter((a) => ids(a.subEvent)[0] === e.id && studentIds.has(ids(a.member)[0]));
        const byStatus = new Map<string, number>();
        for (const s of statuses) byStatus.set(s.status ?? '', (byStatus.get(s.status ?? '') ?? 0) + 1);
        return {
          id: e.id,
          title: e.title ?? 'Untitled',
          type: e.type ?? 'Rehearsal',
          date: e.date ?? null,
          dateTbc: !!e.dateTbc,
          startTime: e.startTime ?? null,
          endTime: e.endTime ?? null,
          showNames: showIds.map((sid) => shows.records.find((s) => s.id === sid)?.showName ?? '').filter(Boolean),
          counts: {
            attending: byStatus.get('Expected Arrival') ?? 0,
            maybe: byStatus.get('Maybe') ?? 0,
            notAttending: byStatus.get('Not Attending') ?? 0,
            notSet: students.length - (byStatus.get('Expected Arrival') ?? 0) - (byStatus.get('Maybe') ?? 0) - (byStatus.get('Not Attending') ?? 0),
          },
          statuses: statuses.map((s) => ({
            studentId: ids(s.member)[0] ?? '',
            status: s.status ?? null,
            reason: s.reason ?? '',
          })),
        };
      })
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

    const nextDated = upcoming.find((e) => e.date && e.date >= today);
    const nextEvent = nextDated
      ? {
          id: nextDated.id,
          title: nextDated.title,
          type: nextDated.type,
          date: nextDated.date,
          dateTbc: nextDated.dateTbc,
          startTime: nextDated.startTime,
          endTime: nextDated.endTime,
          showNames: nextDated.showNames,
          daysUntil: Math.max(0, Math.round((Date.parse(nextDated.date + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 86_400_000)),
        }
      : null;

    return {
      me: mapMember(me),
      nextEvent,
      upcoming: upcoming.slice(0, 30),
      students,
    };
  },
});