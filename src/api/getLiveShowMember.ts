import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireMember } from '../lib/server';
import {
  openLiveShow,
  mapLiveShow,
  loadLiveShowScenes,
  loadLiveShowScripts,
  loadLiveShowDevices,
  loadLiveShowMessages,
  activeAnnouncements,
  touchLiveShowDevice,
} from '../lib/liveShow';

export default createEndpoint({
  description: 'Live show state for an open show, from the signed-in view',
  authenticated: true,
  inputSchema: z.object({
    deviceKey: z.string().max(120).optional(),
    deviceName: z.string().max(120).optional(),
    platform: z.string().max(60).optional(),
    userAgent: z.string().max(400).optional(),
    adminView: z.boolean().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    const liveShow = await openLiveShow();
    if (!liveShow) return { open: false };
    const isAdmin = !!me.isAdmin;
    const canEdit = isAdmin || !!liveShow.crewCanEdit;
    const name = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'Crew';
    await touchLiveShowDevice(liveShow.id, {
      deviceKey: input.deviceKey,
      name: input.deviceName || name,
      platform: input.platform,
      userAgent: input.userAgent,
      member: me.id,
      adminView: input.adminView,
    });
    return {
      open: true,
      liveShow: mapLiveShow(liveShow),
      scenes: await loadLiveShowScenes(liveShow.id),
      canEdit,
      scripts: canEdit ? await loadLiveShowScripts(liveShow.id) : undefined,
      announcements: await activeAnnouncements(liveShow.id),
      messages: await loadLiveShowMessages(liveShow.id),
      devices: isAdmin ? await loadLiveShowDevices(liveShow.id) : undefined,
      me: { id: me.id, name, isAdmin },
    };
  },
});
