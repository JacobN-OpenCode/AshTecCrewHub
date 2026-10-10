import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { mapLiveShow, liveShowElapsedMs, isLiveShowStatus } from '../lib/liveShow';

export default createEndpoint({
  description: 'Controls the live show clock, current scene and status (admins, or the show code)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string(),
    action: z.string(),
    status: z.string().optional(),
    sceneIndex: z.number().optional(),
    // Movement-alert config, editable from the in-dashboard quick controls
    // (ticket f75f7b40) as well as the setup page.
    movementAlert: z.boolean().optional(),
    movementMessage: z.string().max(300).optional(),
    movementSeconds: z.number().optional(),
    movementAdmins: z.array(z.string()).max(50).optional(),
    // Quick controls on a stage screen (ticket f75f7b40) unlock with the show
    // code, so a signed-out machine behind the code can still drive the clock.
    // A signed-in caller is held to the admin rule instead.
    code: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const ls = await zite.liveShows.findOne({ id: input.liveShowId });
    if (!ls) throw new Error('Live show not found.');
    if (context.user) {
      await requireAdmin(context.user.email);
    } else {
      const expected = (ls.code ?? '').trim();
      if (!expected || (input.code ?? '').trim() !== expected) throw new Error('Admins only.');
    }
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
      case 'movement':
        if (typeof input.movementAlert === 'boolean') record.movementAlert = input.movementAlert;
        if (typeof input.movementMessage === 'string') record.movementMessage = input.movementMessage.slice(0, 300);
        if (typeof input.movementSeconds === 'number') record.movementSeconds = Math.min(145, Math.max(2, Math.floor(input.movementSeconds)));
        if (Array.isArray(input.movementAdmins)) record.movementAdmins = input.movementAdmins;
        break;
      default:
        throw new Error(`Unknown live show action: ${input.action}`);
    }
    await zite.liveShows.update({ id: ls.id, record });
    const updated = (await zite.liveShows.findOne({ id: ls.id })) ?? ls;
    return { liveShow: mapLiveShow(updated) };
  },
});