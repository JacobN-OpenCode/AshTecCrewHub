import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite, db } from '#db';
import { requireAdmin } from '../lib/server';

/** Admins open rota slots (front-of-house, stewarding) on an event. */
export default createEndpoint({
  description: 'Add, edit or remove a rota slot on an event (admin)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    subEventId: z.string().optional(),
    role: z.string().max(120).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    note: z.string().max(500).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireAdmin(context.user.email);
    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      await db().query(`DELETE FROM "RotaSignups" WHERE "slot" = $1`, [input.id]);
      await zite.rotaSlots.delete({ id: input.id });
      return { ok: true, id: input.id };
    }
    if (input.id) {
      const existing = await zite.rotaSlots.findOne({ id: input.id });
      if (!existing) throw new Error('Slot not found.');
      const record: Record<string, unknown> = {};
      if (input.role !== undefined) record.role = input.role.slice(0, 120);
      if (input.capacity !== undefined) record.capacity = input.capacity;
      if (input.note !== undefined) record.note = input.note.slice(0, 500);
      await zite.rotaSlots.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }
    const subEventId = (input.subEventId ?? '').trim();
    const role = (input.role ?? '').trim();
    if (!subEventId) throw new Error('Pick an event.');
    if (!role) throw new Error('Give the slot a role.');
    const created = await zite.rotaSlots.create({
      record: {
        subEvent: subEventId,
        role: role.slice(0, 120),
        capacity: input.capacity ?? 1,
        note: (input.note ?? '').slice(0, 500),
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
