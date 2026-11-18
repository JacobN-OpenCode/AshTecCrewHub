import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids } from '../lib/server';
import { activeSession, one } from '../lib/presence';

/**
 * One page for both halves of taking a register (feedback round 3).
 *
 * Called with no id it returns the picker: every dated event the crew can be
 * marked in on, with the type and time so the admin can recognise the session
 * in front of them. Called with an id it returns that session's roster.
 *
 * The mode is decided here rather than in the UI, because it is a property of
 * the event and not of the screen: a club session belongs to no show, so there
 * is nothing to prepare for and no reason to scan anybody in - it is a plain
 * register. Anything hanging off a show (a rehearsal, a performance) is a
 * "who is in the building for this" question, so scanning is offered too.
 */
export default createEndpoint({
  description: 'The picker, or one event roster, for taking a register (admins)',
  authenticated: true,
  inputSchema: z.object({ subEventId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);

    const subs = (await zite.subEvents.findAll({ limit: 2000 })).records.filter((s) => !s.hidden);
    const shows = (await zite.shows.findAll({ limit: 500 })).records;
    const showName = (id: string) => shows.find((s) => s.id === id)?.showName ?? '';

    const session = await activeSession();
    const sessionFor = (subEventId: string) => {
      const sid = session ? one(session.subEvent) : undefined;
      return { open: !!session, thisEvent: !!session && sid === subEventId, onEvent: sid ?? null };
    };
    const openTitle = session ? subs.find((s) => s.id === one(session.subEvent))?.title ?? 'another session' : '';

    const shape = (s: (typeof subs)[number]) => {
      const showIds = ids(s.shows);
      return {
        id: s.id,
        title: s.title ?? '',
        type: s.type ?? '',
        subtype: s.subtype ?? '',
        date: s.date ?? null,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        meetTime: s.meetTime ?? null,
        showNames: showIds.map(showName).filter(Boolean),
        mode: showIds.length ? ('scan' as const) : ('register' as const),
      };
    };

    if (!input.subEventId) {
      return {
        mode: 'pick' as const,
        events: subs.map(shape).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
        openSession: session ? { id: session.id, title: openTitle, subEventId: one(session.subEvent) ?? '' } : null,
      };
    }

    const sub = subs.find((s) => s.id === input.subEventId);
    if (!sub) throw new Error('That event no longer exists.');
    const event = shape(sub);
    const showIds = ids(sub.shows);

    const [memberRecords, attRecords, responseRecords] = await Promise.all([
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.attendance.findAll({ filters: { subEvent: sub.id }, limit: 2000 }),
      showIds.length ? zite.showResponses.findAll({ limit: 4000 }) : Promise.resolve({ records: [] }),
    ]);

    const attByMember = new Map<string, { status: string; byAdmin: boolean }>();
    for (const a of attRecords.records) {
      const mid = ids(a.member)[0];
      if (mid) attByMember.set(mid, { status: a.status ?? '', byAdmin: !!a.enteredByAdmin });
    }

    const expected = new Set<string>();
    for (const r of responseRecords.records) {
      if (!ids(r.show).some((id) => showIds.includes(id))) continue;
      const mid = ids(r.member)[0];
      if (mid && ['Yes', 'Maybe'].includes(r.response ?? '')) expected.add(mid);
    }

    const members = memberRecords.records
      .filter((m) => m.memberType !== 'Contractor' && !m.isPreviewAccount)
      .map((m) => {
        const att = attByMember.get(m.id);
        return {
          id: m.id,
          name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || 'Unknown',
          year: m.year ?? '',
          roles: m.roles ?? [],
          // A tick is what an admin recorded on the night; an RSVP is what the
          // member said beforehand. They read very differently on a register,
          // so they stay separate here instead of both looking "present".
          ticked: !!att && att.status === 'Expected Arrival' && att.byAdmin,
          rsvp: att && att.status === 'Expected Arrival' && !att.byAdmin ? 'Coming' : att?.status ?? '',
          expected: expected.has(m.id) || !!att,
        };
      })
      .sort((a, b) => Number(b.ticked) - Number(a.ticked) || Number(b.expected) - Number(a.expected) || a.name.localeCompare(b.name));

    return {
      mode: 'roster' as const,
      event,
      openSession: session ? { id: session.id, title: openTitle, subEventId: one(session.subEvent) ?? '' } : null,
      members,
      ticked: members.filter((m) => m.ticked).length,
      total: members.length,
      expectedCount: members.filter((m) => m.expected).length,
      sessionFor: sessionFor(sub.id),
    };
  },
});
