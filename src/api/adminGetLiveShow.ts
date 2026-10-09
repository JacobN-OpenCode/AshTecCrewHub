import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { mapLiveShow, loadLiveShowScenes, loadLiveShowScripts } from '../lib/liveShow';

export default createEndpoint({
  description: 'Loads the live show config, scenes and shared script for a show (admins)',
  authenticated: true,
  inputSchema: z.object({ showId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    if (!input.showId) return { liveShow: null, scenes: [], scripts: null };
    const liveShow = await zite.liveShows.findOne({ filters: { showId: input.showId } });
    if (!liveShow) return { liveShow: null, scenes: [], scripts: null };
    return {
      liveShow: mapLiveShow(liveShow),
      scenes: await loadLiveShowScenes(liveShow.id),
      scripts: await loadLiveShowScripts(liveShow.id, undefined, true),
    };
  },
});