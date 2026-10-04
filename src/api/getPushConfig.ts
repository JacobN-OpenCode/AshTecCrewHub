import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { publicKey } from '../../server/push';

/**
 * The VAPID public key the browser needs to create a push subscription, plus
 * whether this member has admin notifications switched on. Public and
 * unauthenticated on purpose: the key is public by design, and the PWA asks for
 * it before the member has necessarily signed in on that device.
 */
export default createEndpoint({
  description: 'Returns the web-push public key and this member’s notification preference',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const key = await publicKey();
    let adminNotifications = false;
    if (context.user) {
      const me = await requireMember(context.user.email);
      adminNotifications =
        me.adminNotifications === null || me.adminNotifications === undefined ? !!me.isAdmin : !!me.adminNotifications;
    }
    return { publicKey: key, adminNotifications };
  },
});
