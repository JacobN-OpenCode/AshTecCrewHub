import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * The member's own scheduling preferences: how long to allow to travel to a
 * call, and which event types they want reminders for.
 */
export default createEndpoint({
  description: 'Save the member’s travel time and reminder preferences',
  authenticated: true,
  inputSchema: z.object({
    travelMinutes: z.number().int().min(0).max(600).optional(),
    reminderPrefs: z.string().max(2000).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const record: Record<string, unknown> = {};
    if (input.travelMinutes !== undefined) record.travelMinutes = input.travelMinutes;
    if (input.reminderPrefs !== undefined) record.reminderPrefs = input.reminderPrefs.slice(0, 2000);
    if (!Object.keys(record).length) return { ok: true };
    await zite.crewMembers.update({ id: me.id, record: record as never });
    return { ok: true };
  },
});
