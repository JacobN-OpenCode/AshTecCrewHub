import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/** Removes a push subscription for this device (notifications switched off). */
export default createEndpoint({
  description: 'Deletes a web-push subscription for this device',
  authenticated: true,
  inputSchema: z.object({ endpoint: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    const { records } = await zite.pushSubscriptions.findAll({ filters: { endpoint: input.endpoint }, limit: 5 });
    for (const r of records) {
      // Only the owner may remove a subscription, so one member cannot silence
      // another's device by guessing an endpoint.
      if (r.member === me.id) await zite.pushSubscriptions.delete({ id: r.id });
    }
    return { success: true };
  },
});
