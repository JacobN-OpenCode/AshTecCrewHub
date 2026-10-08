import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { mapScene } from '../lib/liveShow';

export default createEndpoint({
  description: 'Replaces the scene list for a live show (admins)',
  authenticated: true,
  inputSchema: z.object({
    liveShowId: z.string(),
    scenes: z.array(
      z.object({
        label: z.string().optional(),
        title: z.string().optional(),
        minutes: z.number().optional(),
        cast: z.array(z.string()).optional(),
        notes: z.array(z.string()).optional(),
      }),
    ),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const liveShow = await zite.liveShows.findOne({ id: input.liveShowId });
    if (!liveShow) throw new Error('Live show not found.');
    const { records: existing } = await zite.liveShowScenes.findAll({ filters: { liveShowId: input.liveShowId }, limit: 500 });
    for (const s of existing) await zite.liveShowScenes.delete({ id: s.id });
    const created = await zite.liveShowScenes.bulkCreate({
      records: input.scenes.map((s, i) => ({
        liveShowId: input.liveShowId,
        label: s.label ?? '',
        title: s.title ?? '',
        minutes: Math.max(0, Math.floor(s.minutes ?? 0)),
        cast: s.cast ?? [],
        notes: s.notes ?? [],
        sortIndex: i,
      })) as never,
    });
    const scenes = created.records.map(mapScene).sort((a, b) => a.sortIndex - b.sortIndex);
    const current = Number(liveShow.currentSceneIndex ?? 0);
    if (current > Math.max(0, scenes.length - 1)) {
      await zite.liveShows.update({ id: liveShow.id, record: { currentSceneIndex: Math.max(0, scenes.length - 1) } });
    }
    return { scenes };
  },
});