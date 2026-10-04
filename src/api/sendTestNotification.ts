import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { sendToMember, ensureVapid } from '../../server/push';

/**
 * Sends a test notification to the signed-in member's own devices.
 *
 * Exists because "I am not getting notifications" is otherwise impossible to tell
 * apart from "you have no device subscribed" or "the browser is blocking them".
 * It reports the count it actually delivered to, so the Settings panel can say
 * which of those it is.
 */
export default createEndpoint({
  description: 'Sends a test push notification to all of this member’s subscribed devices',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ sent: z.number(), subscriptions: z.number() }),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    if (!(await ensureVapid())) throw new Error('Push is not configured on the server.');
    const { records: subs } = await zite.pushSubscriptions.findAll({ filters: { member: me.id }, limit: 50 });
    const sent = await sendToMember(me.id, {
      title: 'AshTec Crew Hub',
      body: 'Test notification — if you can see this, notifications are working.',
      url: '/profile',
      tag: 'test',
    });
    return { sent, subscriptions: subs.length };
  },
});
