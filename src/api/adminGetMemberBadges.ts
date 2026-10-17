import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/** Ticket 3ead37f8: the manual badge grants currently held for one member. */
export default createEndpoint({
  description: 'Lists the manually granted badges for a member (admins)',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string() }),
  outputSchema: z.object({ granted: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const { records } = await zite.memberBadges.findAll({ filters: { member: input.memberId }, limit: 500 });
    return { granted: records.map((r) => r.badgeId).filter((b): b is string => !!b) };
  },
});
