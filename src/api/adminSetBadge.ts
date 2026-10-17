import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { badgeById } from '../lib/badges';

/**
 * Ticket 3ead37f8: grant or revoke one badge for one member by hand.
 *
 * Most badges are derived from a member's stats (src/lib/badges.ts), so they
 * cannot drift. This exists for the work that predates the app - "previous
 * events before ATCMS existed" - where there is no attendance to compute from.
 * A grant is additive: it never removes a badge the predicates already earn, it
 * only adds one on top. Revoking a manual grant removes just that row.
 */
export default createEndpoint({
  description: 'Grants or revokes a manual badge for a member (admins)',
  authenticated: true,
  inputSchema: z.object({
    memberId: z.string(),
    badgeId: z.string(),
    value: z.boolean(),
    note: z.string().max(200).optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);
    if (!badgeById(input.badgeId)) throw new Error('That badge does not exist.');

    const { records } = await zite.memberBadges.findAll({ filters: { member: input.memberId }, limit: 500 });
    const existing = records.find((r) => r.badgeId === input.badgeId);

    if (input.value) {
      if (existing) {
        await zite.memberBadges.update({ id: existing.id, record: { note: input.note ?? existing.note ?? '' } as never });
      } else {
        await zite.memberBadges.create({
          record: { member: input.memberId, badgeId: input.badgeId, note: input.note ?? '', awardedBy: me.id } as never,
        });
      }
    } else if (existing) {
      await zite.memberBadges.delete({ id: existing.id });
    }
    return { success: true };
  },
});
