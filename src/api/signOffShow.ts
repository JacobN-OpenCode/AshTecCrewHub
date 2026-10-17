import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, assertPermission } from '../lib/server';

/**
 * Pre-show sign-off: the caller confirms their bit is ready for a given event.
 * One row per person per event; calling again with remove undoes it.
 */
export default createEndpoint({
  description: "Sign off (or un-sign) that you are ready for a show",
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string().min(1),
    role: z.string().max(120).optional(),
    note: z.string().max(500).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), signed: z.boolean() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    assertPermission(me, 'show.run');
    const sub = await zite.subEvents.findOne({ id: input.subEventId });
    if (!sub) throw new Error('Event not found.');

    const existing = await zite.showSignoffs.findOne({ filters: { subEvent: input.subEventId, member: me.id } });

    if (input.remove) {
      if (existing) await zite.showSignoffs.delete({ id: existing.id });
      return { ok: true, signed: false };
    }

    if (existing) {
      await zite.showSignoffs.update({
        id: existing.id,
        record: { role: (input.role ?? '').slice(0, 120), note: (input.note ?? '').slice(0, 500), at: new Date().toISOString() },
      });
    } else {
      await zite.showSignoffs.create({
        record: {
          subEvent: input.subEventId,
          member: me.id,
          role: (input.role ?? '').slice(0, 120),
          note: (input.note ?? '').slice(0, 500),
        } as never,
      });
    }
    return { ok: true, signed: true };
  },
});
