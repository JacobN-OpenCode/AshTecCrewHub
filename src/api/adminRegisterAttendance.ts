import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids, upsertAttendance } from '../lib/server';

/**
 * Ticket 57ce12eb. Ticking a member off the venue register for a session.
 *
 * A tick writes attendance with a plain expected status; un-ticking removes the
 * row so an unticked member is genuinely absent (rather than recorded as a
 * declined reply, which would read as a response nobody gave). Club sessions
 * are not part of a show, so the automatic attendance sync never touches them
 * and these rows are the only record of the register.
 */
export default createEndpoint({
  description: 'Takes a venue register for an event by ticking members present (admins)',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string(),
    memberId: z.string(),
    present: z.boolean(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const existing = (await zite.attendance.findAll({ filters: { subEvent: input.subEventId }, limit: 2000 })).records
      .find((a) => ids(a.member)[0] === input.memberId);
    if (input.present) {
      await upsertAttendance([{
        memberId: input.memberId,
        subEventId: input.subEventId,
        status: 'Expected Arrival',
        byAdmin: true,
      }]);
    } else if (existing) {
      await zite.attendance.delete({ id: existing.id });
    }
    return { ok: true };
  },
});
