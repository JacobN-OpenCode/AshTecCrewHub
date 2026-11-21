import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/** A member tells the hub, once, when they are not free. */
export default createEndpoint({
  description: 'Add or remove a date the member is not available',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    date: z.string().max(10).optional(),
    allDay: z.boolean().optional(),
    fromTime: z.string().max(5).optional(),
    toTime: z.string().max(5).optional(),
    reason: z.string().max(300).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.memberAvailability.findOne({ id: input.id });
      if (!existing) throw new Error('Entry not found.');
      if (existing.member !== me.id) throw new Error('You can only remove your own availability.');
      await zite.memberAvailability.delete({ id: input.id });
      return { ok: true, id: input.id };
    }
    if (input.id) {
      const existing = await zite.memberAvailability.findOne({ id: input.id });
      if (!existing || existing.member !== me.id) throw new Error('Entry not found.');
      const record: Record<string, unknown> = {};
      if (input.date !== undefined) record.date = input.date;
      if (input.allDay !== undefined) record.allDay = input.allDay;
      if (input.fromTime !== undefined) record.fromTime = input.fromTime;
      if (input.toTime !== undefined) record.toTime = input.toTime;
      if (input.reason !== undefined) record.reason = input.reason.slice(0, 300);
      await zite.memberAvailability.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }
    const date = (input.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date.');
    const allDay = input.allDay ?? true;
    if (!allDay && !(input.fromTime && input.toTime)) throw new Error('Give a from and to time, or mark the whole day.');
    const created = await zite.memberAvailability.create({
      record: {
        member: me.id,
        date,
        allDay,
        fromTime: allDay ? '' : (input.fromTime ?? ''),
        toTime: allDay ? '' : (input.toTime ?? ''),
        reason: (input.reason ?? '').slice(0, 300),
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
