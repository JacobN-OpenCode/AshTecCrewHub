import { z } from 'zod';
import { createEndpoint } from '#backend';
import { findMemberByEmail } from '../lib/server';
import { verifyAdminSecret, credentialEmail } from '../../server/catLogin.js';
import {
  currentLiveShow,
  enableLiveShowDevice,
  loadLiveShowScenes,
  loadLiveShowMessages,
  activeAnnouncements,
  mapLiveShow,
  deviceMovementConfig,
} from '../lib/liveShow';

/**
 * Enable this screen for the stage board (ticket f75f7b40).
 *
 * The old "show code" is gone: a screen is enabled by picking an admin and
 * entering that admin's cat-login secret, which proves the person setting the
 * screen up is staff. The name the admin gives ("Stage Left") is stored on the
 * device row. Movement config is seeded from the show's defaults here. Works
 * before a show is started (currentLiveShow falls back to the newest draft) so
 * screens can be placed and named during setup.
 */
export default createEndpoint({
  description: 'Enable this screen for the live show board (admin email + cat-login secret)',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().min(1).max(120),
    name: z.string().max(120).optional(),
    platform: z.string().max(60).optional(),
    userAgent: z.string().max(400).optional(),
    email: z.string().email(),
    pin: z.string().min(1).max(200),
  }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const liveShow = await currentLiveShow();
    if (!liveShow) throw new Error('No live show has been set up yet.');
    const member = await findMemberByEmail(input.email);
    if (!member?.isAdmin || !(await verifyAdminSecret(input.email, input.pin))) {
      throw new Error('Those admin details are not right.');
    }
    const device = await enableLiveShowDevice(liveShow, {
      deviceKey: input.deviceKey,
      name: input.name,
      platform: input.platform,
      userAgent: input.userAgent,
      member: member.id,
    });
    return {
      open: !!liveShow.open,
      hasShow: true,
      enabled: true,
      liveShow: mapLiveShow(liveShow),
      device: {
        id: device?.id ?? null,
        name: device?.name ?? '',
        movement: deviceMovementConfig(device ?? {}),
      },
      scenes: await loadLiveShowScenes(liveShow.id),
      announcements: await activeAnnouncements(liveShow.id),
      messages: await loadLiveShowMessages(liveShow.id),
    };
  },
});
