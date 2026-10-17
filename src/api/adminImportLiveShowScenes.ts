import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission, ids } from '../lib/server';

/**
 * Feedback round 2: keep the live show's running order in step with the show
 * itself. Copies any scene from the show workspace that the live show does not
 * already have (matched on label), leaving existing scenes and their props and
 * notes untouched. Non-destructive, so it is safe to run again after adding a
 * scene.
 */
export default createEndpoint({
  description: 'Add the show workspace scenes that the live running order is missing.',
  authenticated: true,
  inputSchema: z.object({ showId: z.string().min(1) }),
  outputSchema: z.object({ added: z.number() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    const liveShow = await zite.liveShows.findOne({ filters: { showId: input.showId } });
    if (!liveShow) throw new Error('This show has no live show set up yet.');

    const [scenes, live] = await Promise.all([
      zite.showScenes.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.liveShowScenes.findAll({ filters: { liveShowId: String(liveShow.id) }, limit: 500 }),
    ]);

    const have = new Set(live.records.map((s) => String(s.label ?? '').trim().toLowerCase()));
    let next = live.records.reduce((m, s) => Math.max(m, Number(s.sortIndex) || 0), -1) + 1;
    let added = 0;
    const ordered = scenes.records.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.label).localeCompare(String(b.label)));
    for (const s of ordered) {
      const label = String(s.label ?? '').trim();
      if (!label || have.has(label.toLowerCase())) continue;
      await zite.liveShowScenes.create({
        record: {
          liveShowId: String(liveShow.id),
          label,
          title: s.title ?? '',
          minutes: Number(s.minutes) || 0,
          cast: (ids(s.cast) as string[]),
          props: [],
          notes: [],
          sortIndex: next++,
        } as never,
      });
      have.add(label.toLowerCase());
      added += 1;
    }
    return { added };
  },
});
