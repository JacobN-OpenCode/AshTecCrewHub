import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';
import { notifyCoverRequest } from '../../server/notify';

/**
 * Ask the crew for cover for an event. The requester (or an admin) can cancel;
 * the request is broadcast as a push so whoever is free can take it.
 */
export default createEndpoint({
  description: 'Request last-minute cover for an event',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string().min(1),
    role: z.string().max(120).optional(),
    reason: z.string().max(500).optional(),
    message: z.string().max(500).optional(),
    remove: z.boolean().optional(),
    id: z.string().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const sub = await zite.subEvents.findOne({ id: input.subEventId });
    if (!sub) throw new Error('Event not found.');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to cancel.');
      const existing = await zite.coverRequests.findOne({ id: input.id });
      if (!existing) throw new Error('Request not found.');
      if (ids(existing.member)[0] !== me.id && !me.isAdmin) throw new Error('You can only cancel your own request.');
      await zite.coverRequests.update({ id: input.id, record: { status: 'Cancelled' } });
      return { ok: true, id: input.id };
    }

    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'A crew member';
    const created = await zite.coverRequests.create({
      record: {
        subEvent: input.subEventId,
        member: me.id,
        role: (input.role ?? '').slice(0, 120),
        reason: (input.reason ?? '').slice(0, 500),
        message: (input.message ?? '').slice(0, 500),
        status: 'Open',
        createdBy: me.id,
      } as never,
    });

    void notifyCoverRequest({
      subEventId: input.subEventId,
      showId: ids(sub.shows)[0],
      title: sub.title ?? 'Show',
      requester: who,
      requesterId: me.id,
      role: (input.role ?? '').trim(),
    }).catch(() => {});

    return { ok: true, id: String(created.id) };
  },
});
