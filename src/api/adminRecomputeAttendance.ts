import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { syncAutoAttendance } from '../lib/server';

/**
 * Ticket b4be3495. Re-runs syncAutoAttendance across every member and every
 * sub-event, to backfill the per-event attendance rows the previous version
 * of sync never added (it only cleared "Not Attending Event" on a decline,
 * never set "Expected Arrival" for a Yes). One-shot bootstrap so the
 * existing data lands in the form the count UI expects.
 *
 * Existing per-event rows are NOT overwritten. The fix only adds pending
 * rows; explicit "Not Attending" or "Maybe" choices are kept as-is.
 */
export default createEndpoint({
  description: 'Recompute auto attendance from show responses (admins, one-shot)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ added: z.number(), autoSet: z.number(), clearedAuto: z.number() }),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);
    const { added, autoSet, clearedAuto } = await syncAutoAttendance({});
    return { added, autoSet, clearedAuto };
  },
});
