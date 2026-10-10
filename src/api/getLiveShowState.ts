import { z } from 'zod';
import { createEndpoint } from '#backend';
import {
  openLiveShow,
  loadLiveShowScenes,
  loadLiveShowScripts,
  loadLiveShowMessages,
  activeAnnouncements,
  touchLiveShowDevice,
  isLiveShowStatus,
} from '../lib/liveShow';

export default createEndpoint({
  description: 'Public live show state, gated by the show code',
  authenticated: false,
  inputSchema: z.object({
    code: z.string().optional(),
    deviceKey: z.string().max(120).optional(),
    deviceName: z.string().max(120).optional(),
    platform: z.string().max(60).optional(),
    userAgent: z.string().max(400).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const liveShow = await openLiveShow();
    if (!liveShow) return { open: false };
    const expected = (liveShow.code ?? '').trim();
    const given = (input.code ?? '').trim();
    // Public by default: a code only locks the board once an admin sets one.
    if (expected && given !== expected) return { open: true, authorized: false };
    // A guest behind the code still counts as a watching device, exactly like a
    // signed-in one, so the admin device list shows the whole room.
    const signedIn = !!context.user;
    await touchLiveShowDevice(liveShow.id, {
      deviceKey: input.deviceKey,
      name: input.deviceName || (signedIn ? 'Crew' : 'Guest'),
      platform: input.platform,
      userAgent: input.userAgent,
      member: null,
    });
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
        crewCanEdit: !!liveShow.crewCanEdit,
        movementAlert: !!liveShow.movementAlert,
        movementMessage: liveShow.movementMessage ?? '',
        movementSeconds: Number(liveShow.movementSeconds ?? 30),
        movementAdmins: Array.isArray(liveShow.movementAdmins) ? liveShow.movementAdmins : [],
      },
      scenes: await loadLiveShowScenes(liveShow.id),
      scripts: await loadLiveShowScripts(liveShow.id),
      announcements: await activeAnnouncements(liveShow.id),
      messages: await loadLiveShowMessages(liveShow.id),
    };
  },
});
