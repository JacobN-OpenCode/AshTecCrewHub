import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * Saves (or replaces) a push subscription for this device.
 *
 * The browser hands us an endpoint plus two keys. The endpoint is unique per
 * browser profile, so it is the identity: re-subscribing on the same device
 * updates the row rather than piling up duplicates. A member signing in on a
 * second device simply gets a second row.
 */
export default createEndpoint({
  description: 'Stores a web-push subscription for the signed-in member’s device',
  authenticated: true,
  inputSchema: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
    userAgent: z.string().max(300).optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);

    // A different member may have used this browser before (a shared school
    // machine). Find by endpoint and reassign, so the device stops notifying
    // the old account.
    const { records } = await zite.pushSubscriptions.findAll({ filters: { endpoint: input.endpoint }, limit: 5 });
    const existing = records[0];
    const record = {
      endpoint: input.endpoint,
      member: me.id,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? '',
    } as never;
    if (existing) await zite.pushSubscriptions.update({ id: existing.id, record });
    else await zite.pushSubscriptions.create({ record });
    return { success: true };
  },
});
