import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { findMemberByEmail, requireAdmin } from '../lib/server';
import { openLiveShow, mapDevice } from '../lib/liveShow';
import { verifyAdminSecret, credentialEmail } from '../../server/catLogin.js';

/**
 * Edit or remove ONE screen from the live show (ticket f75f7b40). Used by both
 * Show Setup and the in-page control panel, so auth accepts either a signed-in
 * admin session or an admin email + cat-login secret (a stage machine is not
 * signed in). Movement alerting is now per device: this is where a screen's own
 * message, timeout and "special admins" push list are customised, overriding
 * whatever the show defaulted them to.
 */
export default createEndpoint({
  description: 'Update or remove a live show screen (admins)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    deviceId: z.string().optional(),
    deviceKey: z.string().max(120).optional(),
    name: z.string().max(120).optional(),
    movementAlert: z.boolean().optional(),
    movementMessage: z.string().max(400).optional(),
    movementSeconds: z.number().min(2).max(600).optional(),
    movementAdmins: z.array(z.string()).max(50).optional(),
    remove: z.boolean().optional(),
    email: z.string().email().optional(),
    memberId: z.string().optional(),
    secret: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (context.user) {
      await requireAdmin(context.user.email);
    } else {
      const email = await credentialEmail(input.email, input.memberId);
      const secret = input.secret ?? '';
      const member = email ? await findMemberByEmail(email) : undefined;
      if (!member?.isAdmin || !secret || !(await verifyAdminSecret(email, secret))) {
        throw new Error('Admins only.');
      }
    }
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');
    const device = input.deviceId
      ? await zite.liveShowDevices.findOne({ id: input.deviceId })
      : input.deviceKey
        ? await zite.liveShowDevices.findOne({ filters: { liveShowId: liveShow.id, deviceKey: input.deviceKey } })
        : undefined;
    if (!device) throw new Error('That screen was not found.');
    if (input.remove) {
      await zite.liveShowDevices.delete({ id: String(device.id) });
      return { device: null, removed: true };
    }
    const record: Record<string, unknown> = {};
    if (input.name !== undefined) record.name = input.name.slice(0, 120);
    if (input.movementAlert !== undefined) record.movementAlert = !!input.movementAlert;
    if (input.movementMessage !== undefined) record.movementMessage = input.movementMessage.slice(0, 400);
    if (input.movementSeconds !== undefined) record.movementSeconds = Math.max(2, Math.min(600, Math.floor(input.movementSeconds)));
    if (input.movementAdmins !== undefined) record.movementAdmins = [...new Set(input.movementAdmins)];
    const updated = await zite.liveShowDevices.update({ id: String(device.id), record });
    return { device: updated ? mapDevice(updated) : null };
  },
});
