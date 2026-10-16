import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';
import { notifyCueCall } from '../../server/notify';

/**
 * A quick cue call: a nudge to specific crew members for an event. Sends a push
 * and keeps a row the recipient can acknowledge so the sender knows it landed.
 */
export default createEndpoint({
  description: 'Send a cue call to one or more crew members',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string().min(1),
    memberIds: z.array(z.string().min(1)).min(1).max(200),
    message: z.string().max(300).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), sent: z.number() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const sub = await zite.subEvents.findOne({ id: input.subEventId });
    if (!sub) throw new Error('Event not found.');

    const message = (input.message ?? '').trim().slice(0, 300);
    const targets = [...new Set(input.memberIds)];
    await Promise.all(
      targets.map((member) =>
        zite.cueCalls.create({
          record: { subEvent: input.subEventId, member, message, by: me.id } as never,
        }),
      ),
    );

    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'A crew member';
    void notifyCueCall({
      memberIds: targets,
      subEventId: input.subEventId,
      showId: ids(sub.shows)[0],
      title: sub.title ?? 'Show',
      message,
      from: who,
    }).catch(() => {});

    return { ok: true, sent: targets.length };
  },
});
