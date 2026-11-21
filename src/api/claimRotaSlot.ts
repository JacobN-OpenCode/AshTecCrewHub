import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';

/** A member claims (or releases) a seat on a rota slot. */
export default createEndpoint({
  description: 'Sign up to, or step down from, a rota slot',
  authenticated: true,
  inputSchema: z.object({ slotId: z.string().min(1), release: z.boolean().optional() }),
  outputSchema: z.object({ ok: z.boolean(), signedUp: z.boolean(), full: z.boolean() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const slot = await zite.rotaSlots.findOne({ id: input.slotId });
    if (!slot) throw new Error('Slot not found.');
    const signups = await zite.rotaSignups.findAll({ filters: { slot: input.slotId }, limit: 500 });
    const mine = signups.records.find((s) => (ids(s.member)[0] ?? '') === me.id);

    if (input.release) {
      if (mine) await zite.rotaSignups.delete({ id: mine.id });
      return { ok: true, signedUp: false, full: signups.records.length >= (slot.capacity ?? 1) };
    }
    if (mine) return { ok: true, signedUp: true, full: false };
    if (signups.records.length >= (slot.capacity ?? 1)) throw new Error('This slot is already full.');
    await zite.rotaSignups.create({ record: { slot: input.slotId, member: me.id } as never });
    return { ok: true, signedUp: true, full: signups.records.length + 1 >= (slot.capacity ?? 1) };
  },
});
