import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, ids, mapShow, mapSubEvent, todayIso } from '../lib/server';

const NOT_ATTENDING = ['Not Attending', 'Not Attending Event'];

/** minutes since midnight for an "HH:MM" string, or null. */
function mins(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * The scheduling hub for one member: where their events clash with each other
 * or with a day they have marked unavailable, the term-at-a-glance (with exam
 * blackout dates), their self sign-up rotas, and their travel/reminder prefs.
 */
export default createEndpoint({
  description: 'Clashes, term overview, availability, rotas and schedule preferences',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional(), from: z.string().optional(), to: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const [shows, subs, resps, att, blackouts, avail, slots, signups] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ filters: { member: me.id }, limit: 500 }),
      zite.attendance.findAll({ filters: { member: me.id }, limit: 2000 }),
      zite.examBlackouts.findAll({ limit: 500 }),
      zite.memberAvailability.findAll({ filters: { member: me.id }, limit: 500 }),
      zite.rotaSlots.findAll({ limit: 2000 }),
      zite.rotaSignups.findAll({ limit: 5000 }),
    ]);

    const respMap = new Map(resps.records.map((r) => [ids(r.show)[0], r.response ?? null]));
    const attMap = new Map(att.records.map((a) => [ids(a.subEvent)[0], a]));
    const hiddenShows = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));
    const contractor = me.memberType === 'Contractor';
    const today = todayIso();

    // The events this member is actually expected at: their own invites, plus
    // anything for a show they said Yes/Maybe to, minus anything they have said
    // they are not attending.
    const myEvents = subs.records
      .map((e) => mapSubEvent(e))
      .filter((e) => !e.hidden)
      .filter((e) => !(e.showIds.length && e.showIds.every((id) => hiddenShows.has(id))))
      .filter((e) => (contractor ? e.contractorIds.includes(me.id) : (e.showIds.length === 0 || e.showIds.some((id) => ['Yes', 'Maybe'].includes(respMap.get(id) ?? '')))))
      .filter((e) => !NOT_ATTENDING.includes(attMap.get(e.id)?.status ?? ''))
      .filter((e) => (e.date ?? '') >= today)
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')));

    const showName = (e: { showIds: string[] }) => {
      const s = shows.records.find((x) => e.showIds.includes(x.id));
      return s ? mapShow(s).name : '';
    };

    const availByDate = new Map(avail.records.map((a) => [a.date ?? '', a]));

    // A clash group is two or more things on the same day that overlap in time,
    // or anything on a day marked unavailable.
    const byDate = new Map<string, typeof myEvents>();
    for (const e of myEvents) {
      const d = e.date ?? '';
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(e);
    }

    const clashes: { date: string; kind: string; reason: string; events: { id: string; title: string; type: string; startTime: string | null; endTime: string | null; meetTime: string; showName: string }[] }[] = [];
    for (const [date, list] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const ev = (e: typeof list[number]) => ({ id: e.id, title: e.title, type: e.type, startTime: e.startTime, endTime: e.endTime, meetTime: e.meetTime, showName: showName(e) });
      const av = availByDate.get(date);
      const starts = list.map((e) => mins(e.startTime ?? e.meetTime)).filter((n): n is number => n !== null);
      const allUntimed = starts.length !== list.length;
      if (list.length > 1 && allUntimed) {
        clashes.push({ date, kind: 'overlap', reason: 'Two or more things on the same day (one has no set time).', events: list.map(ev) });
      } else if (list.length > 1) {
        // Check every pair for a genuine time overlap.
        const timed = list.map((e) => ({ e, s: mins(e.startTime ?? e.meetTime)!, f: mins(e.endTime) ?? (mins(e.startTime ?? e.meetTime)! + 60) }));
        const group = new Set<string>();
        for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
          if (timed[i].s < timed[j].f && timed[j].s < timed[i].f) { group.add(timed[i].e.id); group.add(timed[j].e.id); }
        }
        if (group.size) clashes.push({ date, kind: 'overlap', reason: 'These overlap in time.', events: list.filter((e) => group.has(e.id)).map(ev) });
      }
      if (av) {
        if (av.allDay) {
          clashes.push({ date, kind: 'unavailable', reason: av.reason ? `You said you are not free: ${av.reason}` : 'You said you are not free this day.', events: list.map(ev) });
        } else {
          const as = mins(av.fromTime), af = mins(av.toTime);
          const hit = as !== null && af !== null && list.some((e) => {
            const s = mins(e.startTime ?? e.meetTime);
            const f = mins(e.endTime) ?? (s !== null ? s + 60 : null);
            return s !== null && f !== null && as < f && s < af;
          });
          if (hit) clashes.push({ date, kind: 'unavailable', reason: av.reason ? `You are busy ${av.fromTime}-${av.toTime}: ${av.reason}` : `You are busy ${av.fromTime}-${av.toTime}.`, events: list.map(ev) });
        }
      }
    }

    // Term overview: events grouped by school term, with blackout dates flagged.
    const termOf = (d: string): string => {
      if (!d) return 'Unscheduled';
      const [y, m] = d.split('-').map(Number);
      if (m >= 9 && m <= 12) return `Autumn ${y}`;
      if (m >= 1 && m <= 3) return `Spring ${y}`;
      if (m >= 4 && m <= 7) return `Summer ${y}`;
      return `Summer ${y - 1}`;
    };
    const terms = new Map<string, { term: string; events: { id: string; title: string; type: string; date: string | null; startTime: string | null; showName: string }[] }>();
    for (const e of myEvents) {
      const t = termOf(e.date ?? '');
      if (!terms.has(t)) terms.set(t, { term: t, events: [] });
      terms.get(t)!.events.push({ id: e.id, title: e.title, type: e.type, date: e.date, startTime: e.startTime, showName: showName(e) });
    }

    const blackoutRows = blackouts.records
      .map((b) => ({ id: b.id, label: b.label ?? '', startDate: b.startDate ?? '', endDate: b.endDate ?? '', note: b.note ?? '' }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const inBlackout = (d: string) => blackoutRows.some((b) => b.startDate && d >= b.startDate && d <= (b.endDate || b.startDate));

    // Rotas: any upcoming event the member could help at, not just the ones they
    // are already down for. A sign-up rota is useless if you can only see slots
    // for shows you have already answered, so visibility mirrors "what this
    // member could attend at all": contractors see their invites, everyone else
    // sees every non-hidden upcoming event.
    const rotaEvents = subs.records
      .map((e) => mapSubEvent(e))
      .filter((e) => !e.hidden)
      .filter((e) => !(e.showIds.length && e.showIds.every((id) => hiddenShows.has(id))))
      .filter((e) => (e.date ?? '') >= today)
      .filter((e) => (contractor ? e.contractorIds.includes(me.id) : true));
    const rotaEventsById = new Map(rotaEvents.map((e) => [e.id, e]));
    const signupsBySlot = new Map<string, { member: string; name: string }[]>();
    for (const su of signups.records) {
      const slotId = ids(su.slot)[0] ?? '';
      const m = me.id === (ids(su.member)[0] ?? '') ? { member: me.id, name: `${me.firstName} ${me.lastName}`.trim() } : { member: ids(su.member)[0] ?? '', name: '' };
      if (!signupsBySlot.has(slotId)) signupsBySlot.set(slotId, []);
      signupsBySlot.get(slotId)!.push(m);
    }
    const rotaRows = slots.records
      .filter((s) => rotaEventsById.has(ids(s.subEvent)[0] ?? ''))
      .map((s) => {
        const ev = rotaEventsById.get(ids(s.subEvent)[0] ?? '');
        const taken = signupsBySlot.get(s.id) ?? [];
        return {
          id: s.id,
          subEvent: ids(s.subEvent)[0] ?? '',
          eventTitle: ev?.title ?? '',
          date: ev?.date ?? null,
          startTime: ev?.startTime ?? null,
          role: s.role ?? '',
          capacity: s.capacity ?? 1,
          note: s.note ?? '',
          taken: taken.length,
          signedUp: taken.some((t) => t.member === me.id),
        };
      })
      .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

    const availability = avail.records
      .map((a) => ({ id: a.id, date: a.date ?? '', allDay: !!a.allDay, fromTime: a.fromTime ?? '', toTime: a.toTime ?? '', reason: a.reason ?? '' }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      clashes,
      events: myEvents.map((e) => ({ id: e.id, title: e.title, type: e.type, date: e.date, meetTime: e.meetTime, startTime: e.startTime, showName: showName(e) })),
      terms: [...terms.values()].sort((a, b) => a.term.localeCompare(b.term)),
      blackouts: blackoutRows.map((b) => ({ ...b, clashesWithTerm: inBlackout(b.startDate) })),
      availability,
      rotas: rotaRows,
      today,
      travelMinutes: (me as unknown as { travelMinutes?: number }).travelMinutes ?? 0,
      reminderPrefs: (me as unknown as { reminderPrefs?: string }).reminderPrefs ?? '',
      isAdmin: !!me.isAdmin,
      memberId: me.id,
    };
  },
});
