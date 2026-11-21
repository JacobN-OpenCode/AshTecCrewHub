import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember, ids } from '../lib/server';

/**
 * The "show memories" wall (Batch 8): at the end of a run, everything worth
 * keeping in one place.
 *
 * Each show that has any backstage photos or debrief notes becomes a card with
 * its best moments: the photo gallery and the lines people wrote down. Shows
 * are ordered by their most recent event so the freshest run is first, and a run
 * whose last event is in the past is marked finished. Hidden shows stay visible
 * only to admins, matching everywhere else.
 */
export default createEndpoint({
  description: 'The show memories wall: photos and debrief lines per show (members)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);

    const [showsRes, subsRes, photosRes, debriefsRes, membersRes] = await Promise.all([
      zite.shows.findAll({ limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showPhotos.findAll({ limit: 2000 }),
      zite.showDebriefs.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);

    const nameOf = (id?: string | null) => {
      if (!id) return '';
      const m = membersRes.records.find((x) => x.id === id);
      if (!m) return '';
      const mm = mapMember(m);
      return `${mm.firstName}${mm.lastName ? ' ' + mm.lastName : ''}`;
    };

    const today = new Date().toISOString().slice(0, 10);

    const shows = showsRes.records
      .filter((s) => me.isAdmin || !s.hidden)
      .map((s) => {
        const photos = photosRes.records
          .filter((p) => ids(p.show).includes(s.id))
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
          .map((p) => ({
            id: p.id,
            url: p.url ?? '',
            caption: p.caption ?? '',
            scene: p.scene ?? '',
            byName: nameOf(ids(p.createdBy)[0]),
          }));

        const quotes = debriefsRes.records
          .filter((d) => ids(d.show).includes(s.id))
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
          .map((d) => ({
            id: d.id,
            body: d.body ?? '',
            authorName: nameOf(ids(d.author)[0]),
            createdAt: d.createdAt ?? null,
          }))
          .filter((q) => q.body.trim().length > 0);

        const eventDates = subsRes.records
          .filter((e) => ids(e.shows).includes(s.id))
          .map((e) => String(e.date ?? ''))
          .filter(Boolean)
          .sort();
        const lastEvent = eventDates[eventDates.length - 1] ?? '';

        return {
          id: s.id,
          name: s.showName ?? '',
          shortCode: s.shortCode ?? '',
          finished: !!lastEvent && lastEvent < today,
          lastEvent,
          photos,
          quotes,
          photoCount: photos.length,
          quoteCount: quotes.length,
        };
      })
      .filter((s) => s.photoCount > 0 || s.quoteCount > 0)
      .sort((a, b) => String(b.lastEvent).localeCompare(String(a.lastEvent)));

    return { shows };
  },
});
