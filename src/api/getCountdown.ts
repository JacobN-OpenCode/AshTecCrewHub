import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, ids, mapShow, mapSubEvent, todayIso } from '../lib/server';

/**
 * The opening-night countdown for the home screen: the soonest upcoming
 * performance across the shows the member is taking part in, with the days
 * remaining and a rehearsal tally for the same show. Null when there is
 * nothing on the horizon.
 */
export default createEndpoint({
  description: 'Days until the next performance for the signed-in member',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const [shows, subs] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
    ]);
    const hidden = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));
    const today = todayIso();

    const visible = shows.records.filter((s) => !s.hidden);
    const upcoming = subs.records
      .map((e) => mapSubEvent(e))
      .filter((e) => !e.hidden)
      .filter((e) => !(e.showIds.length && e.showIds.every((id) => hidden.has(id))))
      .filter((e) => (e.type ?? '') === 'Performance')
      .filter((e) => (e.date ?? '') >= today)
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

    const next = upcoming[0];
    if (!next) return { countdown: null };

    const showId = next.showIds[0] ?? '';
    const show = visible.find((s) => s.id === showId);
    const days = Math.max(0, Math.round((Date.parse(next.date ?? today) - Date.parse(today)) / 86400000));
    const showEvents = subs.records
      .map((e) => mapSubEvent(e))
      .filter((e) => e.showIds.includes(showId));
    const rehearsalsRemaining = showEvents.filter((e) => e.type === 'Rehearsal' && (e.date ?? '') >= today).length;

    return {
      countdown: {
        showId,
        showName: show ? mapShow(show).name : next.title,
        code: show ? mapShow(show).code : '',
        date: next.date,
        startTime: next.startTime,
        days,
        title: next.title,
        rehearsalsRemaining,
      },
    };
  },
});
