import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids, upsertAttendance } from '../lib/server';

/**
 * Ticket 57ce12eb, extended for the school-style register.
 *
 * A register row is one of three colours, and the colour is the record:
 *   green  - in, attending
 *   yellow - away for a while (lunch, a meeting, called out), with a reason
 *   red    - not in (appointment, unwell), with a reason
 * Tapping the colour that is already set clears the row, so a wrong tap is one
 * tap to undo. Yellow and red must carry a reason, because a school has to be
 * able to say *why* someone was not in the room, not just that they were not.
 *
 * Green writes the plain expected status. Yellow and red write 'Not Attending'
 * with the reason. Every row keeps its colour in registerState, so the register
 * reopens exactly as it was left, and the reason is on the attendance record
 * itself rather than in a comment somewhere.
 *
 * Club sessions are not part of a show, so the automatic attendance sync never
 * touches them and these rows are the only record of the register.
 */
const STATE = z.enum(['green', 'yellow', 'red', '']);

export default createEndpoint({
  description: 'Takes a venue register for an event, marking members in, away or not in (admins)',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string(),
    memberId: z.string(),
    // Kept so older callers and the scan path still work unchanged.
    present: z.boolean().optional(),
    state: STATE.optional(),
    reason: z.string().max(200).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), state: STATE }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const state = input.state ?? (input.present ? 'green' : '');
    const reason = (input.reason ?? '').trim().replace(/\s+/g, ' ');
    if ((state === 'yellow' || state === 'red') && reason.length < 2) {
      throw new Error('Give a reason for that, so the register says why.');
    }

    const existing = (await zite.attendance.findAll({ filters: { subEvent: input.subEventId }, limit: 2000 })).records
      .find((a) => ids(a.member)[0] === input.memberId);

    // Same colour tapped again: clear the row entirely, so nobody is left
    // marked as away when they are standing right there.
    if (!state) {
      if (existing) await zite.attendance.delete({ id: existing.id });
      return { ok: true, state };
    }

    await upsertAttendance([{
      memberId: input.memberId,
      subEventId: input.subEventId,
      status: state === 'green' ? 'Expected Arrival' : 'Not Attending',
      reason: state === 'green' ? '' : reason,
      registerState: state,
      byAdmin: true,
    }]);
    return { ok: true, state };
  },
});
