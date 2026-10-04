import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, mapShow, mapSubEvent, ids } from '../lib/server';

/**
 * Backs the calendar for everyone, not just admins.
 *
 * It deliberately does NOT reuse getMyEvents: that one is scoped to the
 * member's own responses, which a shared calendar has no use for. Hidden shows
 * and events stay admin-only here, and previewing a member hides them too, so
 * the tour and the calendar reflect what that account actually sees.
 */
export default createEndpoint({
  description: 'Shows and sub-events for the calendar. Hidden events are only returned to admins.',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const [shows, subs, responses, attendance] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ filters: { member: me.id }, limit: 2000 }),
      // Club sessions have no show to answer for, so their RSVP is per-event
      // attendance rather than a show response; the calendar needs both.
      zite.attendance.findAll({ filters: { member: me.id }, limit: 2000 }),
    ]);
    const responseByShow = new Map(responses.records.map((r) => [
      Array.isArray(r.show) ? r.show[0] : r.show,
      r.response ?? null,
    ]));
    const attendanceByEvent = new Map(attendance.records.map((a) => [ids(a.subEvent)[0], a.status ?? null]));
    const canSeeHidden = me.isAdmin;
    const hiddenShowIds = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));

    return {
      shows: shows.records.filter((s) => canSeeHidden || !s.hidden).map(mapShow),
      subEvents: subs.records
        .map((e) => ({
          ...mapSubEvent(e),
          responses: mapSubEvent(e).showIds.map((showId) => ({ showId, response: responseByShow.get(showId) ?? null })),
          status: attendanceByEvent.get(e.id) ?? null,
        }))
        .filter((e) => canSeeHidden || !e.hidden)
        // An event vanishes with its show only when every show it is in is hidden.
        // Admins skip this: a hidden show is not a deleted show, and an admin
        // still needs its rehearsals to plan the rest of the run. This used to
        // apply to everyone, which silently emptied events out of the admin
        // calendar whenever the only show attached to them was hidden.
        .filter((e) => canSeeHidden || !(e.showIds.length && e.showIds.every((id) => hiddenShowIds.has(id))))
        .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    };
  },
});
