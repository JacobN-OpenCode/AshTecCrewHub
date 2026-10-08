import { z } from 'zod';
import { createEndpoint } from '#backend';
import { openLiveShow, loadLiveShowScenes, isLiveShowStatus } from '../lib/liveShow';

export default createEndpoint({
  description: 'Public live show state, gated by the show code',
  authenticated: false,
  inputSchema: z.object({ code: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const liveShow = await openLiveShow();
    if (!liveShow) return { open: false };
    const expected = (liveShow.code ?? '').trim();
    const given = (input.code ?? '').trim();
    if (!expected || given !== expected) return { open: true, authorized: false };
    const scenes = await loadLiveShowScenes(liveShow.id);
    return {
      open: true,
      authorized: true,
      liveShow: {
        id: liveShow.id,
        name: liveShow.name ?? '',
        areaName: liveShow.areaName ?? 'Stage',
        status: isLiveShowStatus(liveShow.status) ? liveShow.status : 'standby',
        timerMode: liveShow.timerMode === 'running' ? 'running' : 'stopped',
        timerStartAt: liveShow.timerStartAt ?? null,
        timerElapsedMs: Number(liveShow.timerElapsedMs ?? 0),
        currentSceneIndex: Number(liveShow.currentSceneIndex ?? 0),
        intermissionMinutes: Number(liveShow.intermissionMinutes ?? 15),
      },
      scenes,
    };
  },
});