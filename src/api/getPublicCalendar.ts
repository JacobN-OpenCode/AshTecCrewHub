import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * The public, unauthenticated calendar.
 *
 * This exists so parents, teachers and other staff can see when a rehearsal or
 * performance is on without needing a crew account. That makes it the endpoint
 * most likely to be read by someone who is not crew, so it deliberately returns
 * far less than getCalendar does.
 *
 * What it exposes: the title, the kind of event, the date, the meet time, and
 * the show name. That is enough to plan an evening.
 *
 * What it never exposes: descriptions, run times, what to bring, response
 * deadlines, importance, or anything belonging to a hidden show or a hidden
 * event. Those are crew-only and live behind the authenticated getCalendar.
 *
 * Every field is listed explicitly below rather than spreading a mapped record,
 * so adding a column to subEvents cannot accidentally publish it.
 */

/** subEvents.shows is a linked-record list; ids may come back as ids or objects. */
function showsOf(e: { shows?: unknown }): string[] {
  const raw = e.shows;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      out.push((v as { id: string }).id);
    }
  }
  return out;
}

export default createEndpoint({
  description: 'Public calendar of dated events. No login required, crew-only detail is withheld.',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    const [shows, subs] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
    ]);

    // A hidden show is not published, and neither are its events.
    const visibleShows = new Map<string, string>();
    for (const s of shows.records) {
      if (s.hidden) continue;
      visibleShows.set(s.id, s.showName ?? 'Untitled show');
    }

    const events = subs.records
      .filter((e) => !e.hidden)
      // TBC dates are withheld: a date that might move is worse than no date
      // for someone planning to travel.
      .filter((e) => !!e.date && !e.dateTbc)
      // An event whose only shows are hidden is not published.
      .filter((e) => showsOf(e).some((id) => visibleShows.has(id)))
      .map((e) => ({
        id: e.id,
        title: e.title ?? 'Untitled',
        type: e.type ?? 'Rehearsal',
        subtype: e.subtype ?? '',
        date: e.date as string,
        meetTime: e.meetTime ?? '',
        showNames: showsOf(e)
          .map((id) => visibleShows.get(id))
          .filter((n): n is string => !!n),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.meetTime.localeCompare(b.meetTime));

    return { events };
  },
});