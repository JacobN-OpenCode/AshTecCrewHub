import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, ids } from '../lib/server';

const CATEGORIES = ['Prop', 'Costume', 'Set', 'Kit', 'Other'];
const STATUSES = ['Available', 'In use', 'Missing', 'Broken', 'Returned'];

/**
 * Prop & costume inventory: where the good sword is, and who has it. Any member
 * can add and update (props move around mid-rehearsal); admins can delete.
 */
export default createEndpoint({
  description: 'Add, edit or remove a prop/costume inventory row',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    name: z.string().max(200).optional(),
    category: z.enum(['Prop', 'Costume', 'Set', 'Kit', 'Other']).optional(),
    quantity: z.number().int().min(0).max(10000).optional(),
    location: z.string().max(200).optional(),
    holder: z.string().optional(),
    status: z.enum(['Available', 'In use', 'Missing', 'Broken', 'Returned']).optional(),
    notes: z.string().max(1000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      if (!me.isAdmin) throw new Error('Only admins can delete inventory rows.');
      await zite.showProps.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const clamp = (v: string | undefined, n: number) => (v === undefined ? undefined : v.slice(0, n));
    const holder = input.holder === undefined ? undefined : (ids(input.holder)[0] ?? null);

    if (input.id) {
      const existing = await zite.showProps.findOne({ id: input.id });
      if (!existing) throw new Error('Item not found.');
      const record: Record<string, unknown> = {};
      if (input.name !== undefined) record.name = clamp(input.name, 200);
      if (input.category !== undefined) record.category = CATEGORIES.includes(input.category) ? input.category : 'Prop';
      if (input.quantity !== undefined) record.quantity = input.quantity;
      if (input.location !== undefined) record.location = clamp(input.location, 200);
      if (holder !== undefined) record.holder = holder;
      if (input.status !== undefined) record.status = STATUSES.includes(input.status) ? input.status : 'Available';
      if (input.notes !== undefined) record.notes = clamp(input.notes, 1000);
      const saved = await zite.showProps.update({ id: input.id, record });
      return { ok: true, id: String(saved?.id ?? input.id) };
    }

    const name = (input.name ?? '').trim();
    if (!name) throw new Error('Give the item a name.');
    const created = await zite.showProps.create({
      record: {
        show: input.showId,
        name: name.slice(0, 200),
        category: input.category ?? 'Prop',
        quantity: input.quantity ?? 1,
        location: (input.location ?? '').slice(0, 200),
        holder: holder ?? null,
        status: input.status ?? 'Available',
        notes: (input.notes ?? '').slice(0, 1000),
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
