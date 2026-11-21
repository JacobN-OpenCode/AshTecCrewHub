import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { openLiveShow, deviceMovementConfig } from '../lib/liveShow';
import { sendToMembers } from '../../server/push.js';

/**
 * Movement / key-press alerting for one stage screen (ticket f75f7b40).
 *
 * Every screen carries its own config (seeded from the show's defaults when it
 * was enabled). When its alert is on, a bump ("moved") or any key press ("key")
 * logs a touch, raises the on-screen warning and pushes the screen's own
 * "special admins". A repeated bump while the warning is still up does NOT
 * push again; once an admin taps Accept, the next bump warns afresh. "ack"
 * records that acceptance.
 */
export default createEndpoint({
  description: 'Record a movement/key alert or acknowledge one for a live show screen',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    deviceKey: z.string().min(1).max(120),
    action: z.string(),
    kind: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input }) => {
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) return { ok: false };
    const device = await zite.liveShowDevices.findOne({
      filters: { liveShowId: liveShow.id, deviceKey: input.deviceKey },
    });
    if (!device?.enabled) return { ok: false };

    if (input.action === 'ack') {
      await zite.liveShowDevices.update({ id: String(device.id), record: { movementAckAt: new Date().toISOString() } });
      return { ok: true, ack: true };
    }
    if (input.action !== 'moved') return { ok: false };

    const cfg = deviceMovementConfig(device);
    if (!cfg.alert) return { ok: false };

    const kind = input.kind === 'key' ? 'key' : 'movement';
    const prev = device.lastMovementAt ? new Date(device.lastMovementAt).getTime() : 0;
    const ack = device.movementAckAt ? new Date(device.movementAckAt).getTime() : 0;
    const now = Date.now();
    // There is already an un-accepted warning on this screen: log the touch but
    // do not warn or push again until it is accepted.
    const alreadyAlerting = prev > 0 && ack < prev;
    // a81ddee0: add ~30s cool-off before the don't-touch warning reappears
    const COOLDOWN_MS = 30_000;
    const inCooldown = prev > 0 && !alreadyAlerting && (now - prev) < COOLDOWN_MS;

    await zite.liveShowTouches.create({
      record: { liveShowId: liveShow.id, deviceKey: input.deviceKey, deviceName: device.name ?? '', kind },
    });
    await zite.liveShowDevices.update({ id: String(device.id), record: { lastMovementAt: new Date().toISOString() } });

    const message =
      cfg.message || (kind === 'key' ? 'Please do not press keys on this screen.' : 'Please do not move this screen.');
    if (alreadyAlerting || inCooldown) return { ok: true, alert: false, message, seconds: cfg.seconds };

    if (cfg.admins.length) {
      await sendToMembers(cfg.admins, {
        title: kind === 'key' ? 'Live show screen touched' : 'Live show screen moved',
        body: `${device.name || 'A screen'}: ${cfg.message || 'please leave this screen alone'}`,
        url: '/show-dash',
        tag: `live-movement-${liveShow.id}-${device.deviceKey}`,
      }).catch(() => 0);
    }
    return { ok: true, alert: true, message: cfg.message || '', seconds: cfg.seconds, kind };
  },
});
