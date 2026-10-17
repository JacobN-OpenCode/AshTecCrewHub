import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, assertPermission, ids } from '../lib/server';

/**
 * One-tap roll call. Replaces the present-set for an event with exactly the
 * members given: the UI marks everyone present, then the caller toggles the few
 * who are not. Any crew member can take a register.
 */
export default createEndpoint({
  description: 'Set who is present at a rehearsal/performance (roll call)',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string().min(1),
    memberIds: z.array(z.string().min(1)).max(2000),
  }),
  outputSchema: z.object({ ok: z.boolean(), present: z.number() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    assertPermission(me, 'show.run');
    const sub = await zite.subEvents.findOne({ id: input.subEventId });
    if (!sub) throw new Error('Event not found.');

    const present = [...new Set(input.memberIds)];
    const existing = (await zite.rollCalls.findAll({ filters: { subEvent: input.subEventId }, limit: 2000 })).records;
    const have = new Set(existing.map((r) => ids(r.member)[0]));

    // Remove anyone now marked absent, record anyone newly present.
    const toRemove = existing.filter((r) => !present.includes(ids(r.member)[0]));
    const toAdd = present.filter((id) => !have.has(id));

    await Promise.all([
      ...toRemove.map((r) => zite.rollCalls.delete({ id: r.id })),
      ...toAdd.map((id) =>
        zite.rollCalls.create({
          record: { subEvent: input.subEventId, member: id, present: true, by: me.id } as never,
        }),
      ),
    ]);

    return { ok: true, present: present.length };
  },
});
