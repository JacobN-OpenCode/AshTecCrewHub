import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * Create, edit, tick off or delete a show checklist item. Any crew member can
 * add or tick items (the checklist is everyone's job); only admins can delete.
 */
export default createEndpoint({
  description: 'Add, edit, tick or remove a show checklist item',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    label: z.string().max(300).optional(),
    category: z.string().max(60).optional(),
    notes: z.string().max(2000).optional(),
    position: z.number().optional(),
    done: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      if (!me.isAdmin) throw new Error('Only admins can delete checklist items.');
      await zite.showChecklistItems.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    if (input.id) {
      const existing = await zite.showChecklistItems.findOne({ id: input.id });
      if (!existing) throw new Error('Checklist item not found.');
      const record: Record<string, unknown> = {};
      if (input.label !== undefined) record.label = input.label.trim().slice(0, 300);
      if (input.category !== undefined) record.category = input.category.trim().slice(0, 60);
      if (input.notes !== undefined) record.notes = input.notes.slice(0, 2000);
      if (input.position !== undefined) record.position = input.position;
      if (input.done !== undefined) {
        record.done = input.done;
        record.doneBy = input.done ? me.id : null;
        record.doneAt = input.done ? new Date().toISOString() : null;
      }
      const saved = await zite.showChecklistItems.update({ id: input.id, record });
      return { ok: true, id: String(saved?.id ?? input.id) };
    }

    const label = (input.label ?? '').trim();
    if (!label) throw new Error('Give the checklist item a label.');
    const created = await zite.showChecklistItems.create({
      record: {
        show: input.showId,
        label: label.slice(0, 300),
        category: (input.category ?? '').trim().slice(0, 60),
        notes: (input.notes ?? '').slice(0, 2000),
        position: input.position ?? 0,
        done: false,
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
