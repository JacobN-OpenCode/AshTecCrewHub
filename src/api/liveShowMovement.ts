import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { openLiveShow } from '../lib/liveShow';
import { ids } from '../lib/server';
import { sendToMembers } from '../../server/push.js';

/**
 * Movement alerting for a locked-off stage screen (ticket f75f7b40).
 *
 * When the show has movement alerts on, a dashboard that feels a bump calls
 * this with action 'moved'. We record the movement, and - unless the device is
 * already acknowledged - push a notification to the "special admins" chosen in
 * setup, so they get a PWA alert wherever they are. 'ack' is sent when someone
 * taps the on-screen Accept, clearing the warning.
 *
 * Guest devices call this too: the whole point is that a random screen in the
 * room notices it was moved, signed in or not.
 */
export default createEndpoint({
  description: 'Record or acknowledge a live show screen movement',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    deviceKey: z.string().min(1).max(120),
    action: z.enum(['moved', 'ack']),
  }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');
    const device = await zite.liveShowDevices.findOne({
      filters: { liveShowId: liveShow.id, deviceKey: input.deviceKey },
    });
    if (!device) return { ok: false };

    if (input.action === 'ack') {
      await zite.liveShowDevices.update({ id: String(device.id), record: { movementAckAt: new Date().toISOString() } });
      return { ok: true };
    }

    if (!liveShow.movementAlert) return { ok: false };
    const message = (liveShow.movementMessage ?? '').trim() || 'This screen has been moved. Please put it back.';
    const seconds = Math.max(10, Number(liveShow.movementSeconds ?? 30));
    // Whether this bump is a fresh one: a device that was acknowledged at or
    // after its last movement is already handled, so we only ping once per bump.
    const prevMovement = device.lastMovementAt ? new Date(device.lastMovementAt).getTime() : 0;
    const acked = device.movementAckAt ? new Date(device.movementAckAt).getTime() : 0;
    await zite.liveShowDevices.update({ id: String(device.id), record: { lastMovementAt: new Date().toISOString() } });

    if (acked >= prevMovement && prevMovement > 0) return { ok: true, alert: false, message, seconds };

    const recipients = ids(liveShow.movementAdmins);
    if (recipients.length) {
      await sendToMembers(recipients, {
        title: 'Live show screen moved',
        body: `${device.name || 'A screen'}: ${message}`,
        url: '/show-dash',
        tag: `live-movement-${liveShow.id}`,
      }).catch(() => 0);
    }
    return { ok: true, alert: true, message, seconds };
  },
});
