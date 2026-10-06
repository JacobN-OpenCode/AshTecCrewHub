import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';

/**
 * The public, unauthenticated parents page feed.
 *
 * getPublicCalendar deliberately withholds descriptions, what to bring and
 * response deadlines because a calendar glance should not leak crew detail.
 * This endpoint is the other side of that trade: parents were given exactly
 * that detail in the paper letter, so with no account to create and nothing
 * sensitive in these three fields, they get it here too.
 *
 * Still withheld, same as getPublicCalendar: hidden shows, hidden events,
 * importance, run times, attendance, responses, and anything about individual
 * crew members. An event whose only shows are hidden is not published either.
 *
 * Unlike getPublicCalendar this includes dateTbc events - "Date TBC" is what
 * the letter tells parents to expect, and leaving it off the page would hide
 * a production the letter already mentions.
 *
 * Every field is listed explicitly rather than spread from a mapped record,
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
  description: 'Public parents page feed: shows, dates, times, what to bring and deadlines. No login required.',
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async () => {
    const [shows, subs] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
    ]);

    const visibleShows = new Map<string, { name: string; description: string }>();
    for (const s of shows.records) {
      if (s.hidden) continue;
      visibleShows.set(s.id, {
        name: s.showName ?? 'Untitled show',
        description: s.description ?? '',
      });
    }

    const visibleShowsList = [...visibleShows.entries()].map(([id, v]) => ({
      id,
      name: v.name,
      description: v.description,
    }));

    const events = subs.records
      .filter((e) => !e.hidden)
      .filter((e) => showsOf(e).some((id) => visibleShows.has(id)))
      .map((e) => ({
        id: e.id,
        title: e.title ?? 'Untitled',
        type: e.type ?? 'Rehearsal',
        subtype: e.subtype ?? '',
        date: (e.date as string | null) ?? null,
        dateTbc: !!e.dateTbc,
        startTime: e.startTime ?? null,
        endTime: e.endTime ?? null,
        meetTime: e.meetTime ?? '',
        description: e.description ?? '',
        thingsToBring: e.thingsToBring ?? '',
        responseDueDate: (e.responseDueDate as string | null) ?? null,
        dueDateUnknown: !!e.dueDateUnknown,
        showNames: showsOf(e)
          .map((id) => visibleShows.get(id)?.name)
          .filter((n): n is string => !!n),
      }))
      // Dated events first, chronological; "Date TBC" sorts to the end so the
      // page reads as a plan rather than a warning.
      .sort((a, b) => {
        const ad = a.date ?? '9999-99-99';
        const bd = b.date ?? '9999-99-99';
        return ad.localeCompare(bd) || (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99');
      });

    return { shows: visibleShowsList, events };
  },
});
