import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { actingMember, findMemberByEmail, adminCount, mapMember } from '../lib/server';

export default createEndpoint({
  description: 'Returns the signed-in crew member profile',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (input.previewAs) {
      const p = await actingMember(context.user.email, input.previewAs);
      return { member: { ...mapMember(p), isAdmin: false } };
    }
    let m = await findMemberByEmail(context.user.email);
    if (!m && (await adminCount()) === 0) {
      // First ever sign-in becomes the initial admin.
      m = await zite.crewMembers.create({
        record: {
          schoolEmail: context.user.email,
          firstName: context.user.firstName || context.user.email.split('@')[0],
          lastName: context.user.lastName || '',
          isAdmin: true,
          memberType: 'Teacher',
        } as never,
      });
    }
    // The Support tab badge: active tickets whose newest entry isn't a user reply.
    let supportAwaiting = 0;
    if (m?.isAdmin) {
      const { records } = await zite.supportTickets.findAll({ limit: 2000 });
      supportAwaiting = records.filter((t) => ['Open', 'In Progress'].includes(t.status ?? 'Open') && t.lastReplyFrom !== 'User').length;
    }
    return { member: m ? mapMember(m) : null, supportAwaiting };
  },
});
