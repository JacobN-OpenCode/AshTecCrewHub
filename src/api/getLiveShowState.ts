import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import type { AnyRecord } from '#db';
import {
  currentLiveShow,
  loadLiveShowScenes,
  loadLiveShowMessages,
  activeAnnouncements,
  heartbeatLiveShowDevice,
  mapLiveShow,
  deviceMovementConfig,
} from '../lib/liveShow';

/**
 * Public state for the stage board (ticket f75f7b40).
 *
 * The board is hidden until an admin enables the screen (see
 * enableLiveShowDevice.ts), so an un-enabled browser is told only that a show
 * is open; it gets no scenes, chat or announcements until it is enabled. An
 * enabled screen heartbeats here on every poll, which is what keeps its
 * device row "online" and lets Show Setup see it.
 */
export default createEndpoint({
  description: 'Public live show state for a screen that has been enabled',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().max(120).optional(),
    deviceName: z.string().max(120).optional(),
    platform: z.string().max(60).optional(),
    userAgent: z.string().max(400).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const liveShow = await currentLiveShow();
    if (!liveShow) return { open: false, hasShow: false, enabled: false };

    const deviceKey = String(input.deviceKey ?? '').slice(0, 120);
    let device: AnyRecord | undefined;
    if (deviceKey) {
      device = await zite.liveShowDevices.findOne({ filters: { liveShowId: liveShow.id, deviceKey } });
      if (device?.enabled) {
        await heartbeatLiveShowDevice(liveShow.id, {
          deviceKey,
          name: input.deviceName,
          platform: input.platform,
          userAgent: input.userAgent,
        });
      }
    }
    if (!device?.enabled) {
      return { open: !!liveShow.open, hasShow: true, enabled: false, liveShow: mapLiveShow(liveShow) };
    }

    return {
      open: !!liveShow.open,
      hasShow: true,
      enabled: true,
      liveShow: mapLiveShow(liveShow),
      device: { id: String(device.id), name: device.name ?? '', movement: deviceMovementConfig(device) },
      scenes: await loadLiveShowScenes(liveShow.id),
      announcements: await activeAnnouncements(liveShow.id),
      messages: await loadLiveShowMessages(liveShow.id),
    };
  },
});
