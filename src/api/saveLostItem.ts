import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * The lost property log: anything that goes wandering gets tracked here until
 * it finds its way home. Anyone in the show can log an item or mark one found;
 * admins delete.
 */
export default createEndpoint({
  description: 'Log, update or close out a lost property item',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    item: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    status: z.enum(['Lost', 'Found', 'Returned']).optional(),
    holder: z.string().optional(),
    notes: z.string().max(2000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      if (!me.isAdmin) throw new Error('Only admins can delete lost property items.');
      await zite.lostProperty.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    if (input.id) {
      const existing = await zite.lostProperty.findOne({ id: input.id });
      if (!existing) throw new Error('Item not found.');
      const record: Record<string, unknown> = {};
      if (input.item !== undefined) record.item = input.item.trim().slice(0, 200);
      if (input.description !== undefined) record.description = input.description.slice(0, 2000);
      if (input.location !== undefined) record.location = input.location.slice(0, 200);
      if (input.status !== undefined) record.status = input.status;
      if (input.holder !== undefined) record.holder = input.holder || null;
      if (input.notes !== undefined) record.notes = input.notes.slice(0, 2000);
      await zite.lostProperty.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const item = (input.item ?? '').trim();
    if (!item) throw new Error('What is missing?');
    const created = await zite.lostProperty.create({
      record: {
        show: input.showId,
        item: item.slice(0, 200),
        description: (input.description ?? '').slice(0, 2000),
        location: (input.location ?? '').slice(0, 200),
        status: input.status ?? 'Lost',
        holder: input.holder || null,
        notes: (input.notes ?? '').slice(0, 2000),
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
