import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, ids } from '../lib/server';

/**
 * Record the audience headcount for one event. One row per event, so a run's
 * numbers build up night by night. Creator or admin can clear it.
 */
export default createEndpoint({
  description: 'Record or clear the audience headcount for an event',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    subEventId: z.string().min(1),
    count: z.number().int().min(0).max(100000).optional(),
    capacity: z.number().int().min(0).max(1000000).optional(),
    notes: z.string().max(2000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    const existing = await zite.audienceCounts.findOne({ filters: { subEvent: input.subEventId } });

    if (input.remove) {
      if (!existing) return { ok: true, id: '' };
      if (!me.isAdmin && existing.recordedBy !== me.id) throw new Error('You can only clear your own counts.');
      await zite.audienceCounts.delete({ id: existing.id });
      return { ok: true, id: existing.id };
    }

    if (existing) {
      const record: Record<string, unknown> = { recordedBy: me.id, recordedAt: new Date().toISOString() };
      if (input.count !== undefined) record.count = input.count;
      if (input.capacity !== undefined) record.capacity = input.capacity;
      if (input.notes !== undefined) record.notes = input.notes.slice(0, 2000);
      await zite.audienceCounts.update({ id: existing.id, record });
      return { ok: true, id: existing.id };
    }

    if (input.count === undefined) throw new Error('Enter the headcount.');
    const created = await zite.audienceCounts.create({
      record: {
        show: input.showId,
        subEvent: input.subEventId,
        count: input.count,
        capacity: input.capacity ?? 0,
        notes: (input.notes ?? '').slice(0, 2000),
        recordedBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
