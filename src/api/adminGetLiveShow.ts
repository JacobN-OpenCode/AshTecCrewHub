import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import {
  mapLiveShow,
  loadLiveShowScenes,
  loadLiveShowScripts,
  loadLiveShowDevices,
  loadLiveShowMessages,
  loadLiveShowTouches,
  activeAnnouncements,
} from '../lib/liveShow';

const EMPTY = {
  liveShow: null as unknown,
  scenes: [] as unknown[],
  scripts: null as unknown,
  devices: [] as unknown[],
  touches: [] as unknown[],
  messages: [] as unknown[],
  announcements: [] as unknown[],
};

/**
 * Everything Show Setup needs for one show (admins): the config, its scenes and
 * shared script so admins can prepare the running order ANY time, plus, when a
 * show is running, the live screen list, touch log, chat and announcements so
 * the same page is the live control room (ticket f75f7b40).
 */
export default createEndpoint({
  description: 'Loads a live show config, scenes, script and live state for a show (admins)',
  authenticated: true,
  inputSchema: z.object({ showId: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    if (!input.showId) return { ...EMPTY };
    const liveShow = await zite.liveShows.findOne({ filters: { showId: input.showId } });
    if (!liveShow) return { ...EMPTY };
    return {
      liveShow: mapLiveShow(liveShow),
      scenes: await loadLiveShowScenes(liveShow.id),
      scripts: await loadLiveShowScripts(liveShow.id),
      devices: await loadLiveShowDevices(liveShow.id),
      touches: await loadLiveShowTouches(liveShow.id, 60),
      messages: await loadLiveShowMessages(liveShow.id),
      announcements: await activeAnnouncements(liveShow.id),
    };
  },
});
