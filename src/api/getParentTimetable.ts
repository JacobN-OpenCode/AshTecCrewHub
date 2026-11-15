import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { calendarToken, memberEvents } from '../../server/calendar';

/**
 * The public "For parents" lookup.
 *
 * A parent types the address their child added on their profile, and sees the
 * dates that child is involved in, plus a private calendar link for them.
 *
 * What it deliberately never returns: the child's surname, their school email,
 * attendance, responses, whether they turned up, any other crew member's name,
 * or anything about a hidden show. The page has no login, so the whole response
 * has to be safe to show to a stranger who happens to know that address. There
 * is no verification step by design; the child controls the address, and can
 * clear it on their profile at any time.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ChildEvent = {
  id: string;
  title: string;
  type: string;
  subtype: string;
  date: string | null;
  dateTbc: boolean;
  meetTime: string;
  startTime: string | null;
  endTime: string | null;
  show: string;
  sortKey: string;
};

type Child = {
  firstName: string;
  url: string;
  webcal: string;
  events: ChildEvent[];
};

export default createEndpoint({
  description: 'Public lookup: the dates of the crew member who added this parent email',
  authenticated: false,
  inputSchema: z.object({ email: z.string().max(200) }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const wanted = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(wanted)) return { found: false, children: [] };

    const members = await zite.crewMembers.findAll({ limit: 2000 });
    const matches = members.records.filter((m) => {
      if (m.isPreviewAccount) return false;
      const list = (m.parentEmail ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      return list.includes(wanted);
    });
    if (!matches.length) return { found: false, children: [] };

    const shows = await zite.shows.findAll({ limit: 500 });
    const hiddenShows = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));
    const showName = (id: string) => shows.records.find((s) => s.id === id)?.showName ?? '';

    const base = (process.env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');

    const children: Child[] = [];
    for (const m of matches) {
      const { events } = await memberEvents(m.id);

      // A parent sees only what is on the public page's level: anything tied
      // solely to a hidden show stays out, and undated events are kept (the
      // page groups them under "dates still to be confirmed").
      const visible = events
        .filter((e) => e.showIds.length === 0 || e.showIds.some((id) => !hiddenShows.has(id)))
        .map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          subtype: e.subtype,
          date: e.date,
          dateTbc: e.dateTbc,
          meetTime: e.meetTime,
          startTime: e.startTime,
          endTime: e.endTime,
          show: e.showIds.map(showName).filter(Boolean).join(', '),
          sortKey: [e.date ?? '9999-99-99', e.startTime ?? e.meetTime ?? ''].join(' '),
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      const token = await calendarToken(m.id);
      children.push({
        firstName: m.firstName || 'your child',
        url: `${base}/calendar.ics?token=${token}`,
        webcal: `${base.replace(/^https?:\/\//, 'webcal://')}/calendar.ics?token=${token}`,
        events: visible,
      });
    }

    return { found: true, children };
  },
});
