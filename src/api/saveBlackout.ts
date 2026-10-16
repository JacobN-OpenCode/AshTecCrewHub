import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/** Admins keep the exam blackout calendar: dates the crew should be left alone. */
export default createEndpoint({
  description: 'Add, edit or remove an exam blackout period (admin)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    label: z.string().max(200).optional(),
    startDate: z.string().max(10).optional(),
    endDate: z.string().max(10).optional(),
    note: z.string().max(2000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireAdmin(context.user.email);
    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      await zite.examBlackouts.delete({ id: input.id });
      return { ok: true, id: input.id };
    }
    if (input.id) {
      const existing = await zite.examBlackouts.findOne({ id: input.id });
      if (!existing) throw new Error('Blackout not found.');
      const record: Record<string, unknown> = {};
      if (input.label !== undefined) record.label = input.label.slice(0, 200);
      if (input.startDate !== undefined) record.startDate = input.startDate;
      if (input.endDate !== undefined) record.endDate = input.endDate;
      if (input.note !== undefined) record.note = input.note.slice(0, 2000);
      await zite.examBlackouts.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }
    const startDate = (input.startDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Give the blackout a start date.');
    const created = await zite.examBlackouts.create({
      record: {
        label: (input.label ?? '').slice(0, 200),
        startDate,
        endDate: (input.endDate ?? '').trim() || startDate,
        note: (input.note ?? '').slice(0, 2000),
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
