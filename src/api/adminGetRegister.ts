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
/** Unmarked names first, then recorded rows grouped by colour. */
const rank = (state: string) => ({ '': 0, green: 1, yellow: 2, red: 3 } as Record<string, number>)[state] ?? 4;

export default createEndpoint({
  description: 'The picker, or one event roster, for taking a register (admins)',
  authenticated: true,
  inputSchema: z.object({ subEventId: z.string().optional(), showNotAttending: z.boolean().optional() }),
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

    const attByMember = new Map<
      string,
      { status: string; byAdmin: boolean; state: string; reason: string; returnAt: string | null }
    >();
    for (const a of attRecords.records) {
      const mid = ids(a.member)[0];
      if (!mid) continue;
      const mark = (a as unknown as { registerState?: string }).registerState ?? '';
      attByMember.set(mid, {
        status: a.status ?? '',
        byAdmin: !!a.enteredByAdmin,
        // Rows written before the register had colours read as a plain tick.
        state: 'green|yellow|red'.split('|').includes(mark)
          ? mark
          : a.status === 'Expected Arrival' && a.enteredByAdmin ? 'green' : '',
        reason: a.reason ?? '',
        // "Away until 14:30", set when an admin marks a yellow row.
        returnAt: ((a as unknown as { returnAt?: string | null }).returnAt ?? null) as string | null,
      });
    }

    const expected = new Set<string>();
    // The show-wide answer, kept per member so the register can say "answered
    // Yes" against a name even before anyone has touched that person's row.
    const answered = new Map<string, string>();
    for (const r of responseRecords.records) {
      if (!ids(r.show).some((id) => showIds.includes(id))) continue;
      const mid = ids(r.member)[0];
      const answer = r.response ?? '';
      if (!mid || !answer) continue;
      answered.set(mid, answer);
      if (['Yes', 'Maybe'].includes(answer)) expected.add(mid);
    }

    const everyone = memberRecords.records
      .filter((m) => m.memberType !== 'Contractor' && m.memberType !== 'AI Agent' && !m.isPreviewAccount)
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
          // The register colour, and the reason that came with it.
          state: att?.state ?? '',
          reason: att?.state ? att.reason : '',
          // Away with a time that has already passed: someone should go and
          // find them (ticket 2bb49af3).
          returnAt: att?.state === 'yellow' ? (att.returnAt ?? null) : null,
          overdue: !!(att?.state === 'yellow' && att.returnAt && Date.parse(att.returnAt) < Date.now()),
          rsvp: att
            ? att.status === 'Expected Arrival' && !att.byAdmin
              ? 'Coming'
              : att.status
            : answered.get(m.id) ?? '',
          expected: expected.has(m.id) || !!att,
        };
      })
      // Whoever still needs marking sits at the top, then the people already
      // recorded, grouped by colour, so the next name to deal with is always
      // the first one on the screen.
      .sort((a, b) => rank(a.state) - rank(b.state) || a.name.localeCompare(b.name));

    // Ticket 0a192bf9: someone who has already said they are not coming is not
    // expected in the room, so they should not be sitting in the list of names
    // still to mark. Anyone an admin has actually marked stays put whatever
    // their answer was, and one toggle brings the rest back.
    const saidNo = (m: (typeof everyone)[number]) =>
      !m.state && !m.ticked && (m.rsvp === 'No' || m.rsvp === 'Not Attending');
    const notAttending = everyone.filter(saidNo);
    const members = input.showNotAttending ? everyone : everyone.filter((m) => !saidNo(m));

    return {
      mode: 'roster' as const,
      event,
      openSession: session ? { id: session.id, title: openTitle, subEventId: one(session.subEvent) ?? '' } : null,
      members,
      ticked: members.filter((m) => m.state === 'green').length,
      counts: {
        green: members.filter((m) => m.state === 'green').length,
        yellow: members.filter((m) => m.state === 'yellow').length,
        red: members.filter((m) => m.state === 'red').length,
        none: members.filter((m) => !m.state).length,
      },
      total: members.length,
      notAttending: notAttending.length,
      expectedCount: members.filter((m) => m.expected).length,
      sessionFor: sessionFor(sub.id),
    };
  },
});
