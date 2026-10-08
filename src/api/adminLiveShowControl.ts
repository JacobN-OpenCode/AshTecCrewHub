import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { mapLiveShow, liveShowElapsedMs, isLiveShowStatus } from '../lib/liveShow';

export default createEndpoint({
  description: 'Controls the live show clock, current scene and status (admins)',
  authenticated: true,
  inputSchema: z.object({
    liveShowId: z.string(),
    action: z.string(),
    status: z.string().optional(),
    sceneIndex: z.number().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const ls = await zite.liveShows.findOne({ id: input.liveShowId });
    if (!ls) throw new Error('Live show not found.');
    const record: Record<string, unknown> = {};
    switch (input.action) {
      case 'start':
        if (ls.timerMode !== 'running') {
          record.timerMode = 'running';
          record.timerStartAt = new Date().toISOString();
        }
        break;
      case 'pause': {
        record.timerMode = 'stopped';
        record.timerElapsedMs = Math.max(0, Math.floor(liveShowElapsedMs(ls)));
        record.timerStartAt = null;
        break;
      }
      case 'reset':
        record.timerMode = 'stopped';
        record.timerElapsedMs = 0;
        record.timerStartAt = null;
        break;
      case 'scene': {
        const { records } = await zite.liveShowScenes.findAll({ filters: { liveShowId: input.liveShowId }, limit: 500 });
        const max = Math.max(0, records.length - 1);
        record.currentSceneIndex = Math.max(0, Math.min(max, Math.floor(input.sceneIndex ?? 0)));
        break;
      }
      case 'status':
        record.status = isLiveShowStatus(input.status) ? input.status : 'standby';
        break;
      default:
        throw new Error(`Unknown live show action: ${input.action}`);
    }
    await zite.liveShows.update({ id: ls.id, record });
    const updated = (await zite.liveShows.findOne({ id: ls.id })) ?? ls;
    return { liveShow: mapLiveShow(updated) };
  },
});