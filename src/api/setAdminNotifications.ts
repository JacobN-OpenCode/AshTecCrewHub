import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * Turns admin notifications on or off for the signed-in member, and opens a
 * push subscription for them.
 *
 * "Admin notifications" are the operational ones: a new support ticket, a reply
 * on one, and someone waiting for a venue check-in approval. Maintainers get bug
 * reports and feature requests through the same switch (they are the people who
 * act on those). A member who is neither still gets their own notifications -
 * these just do not apply to them.
 */
export default createEndpoint({
  description: 'Sets whether this member receives admin/maintainer notifications',
  authenticated: true,
  inputSchema: z.object({ enabled: z.boolean() }),
  outputSchema: z.object({ enabled: z.boolean(), member: z.any() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    if (me.isPreviewAccount) throw new Error('Preview accounts do not receive notifications.');
    await zite.crewMembers.update({ id: me.id, record: { adminNotifications: input.enabled } as never });
    const { records } = await zite.crewMembers.findAll({ filters: { id: me.id }, limit: 1 });
    return { enabled: input.enabled, member: records[0] ?? null };
  },
});
