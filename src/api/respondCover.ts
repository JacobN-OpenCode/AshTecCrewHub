import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';
import { sendToMember } from '../../server/push';

/**
 * Offer to take (or release) cover for an event. Taking it marks the caller as
 * the cover and tells the requester; releasing reopens it if no one else took it.
 */
export default createEndpoint({
  description: 'Offer to cover an event, or step back down',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().min(1),
    release: z.boolean().optional(),
    message: z.string().max(300).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), status: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const req = await zite.coverRequests.findOne({ id: input.id });
    if (!req) throw new Error('Request not found.');

    if (input.release) {
      if (ids(req.filledBy)[0] !== me.id) throw new Error('You are not covering this.');
      await zite.coverRequests.update({ id: input.id, record: { filledBy: null, status: 'Open' } });
      return { ok: true, status: 'Open' };
    }

    const requester = ids(req.member)[0];
    if (requester === me.id) throw new Error('You asked for the cover.');
    await zite.coverRequests.update({
      id: input.id,
      record: { filledBy: me.id, status: 'Filled', message: (input.message ?? req.message ?? '').slice(0, 500) },
    });

    // Tell the person who asked that help is on the way.
    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'Someone';
    if (requester) {
      void sendToMember(requester, {
        title: 'Cover sorted',
        body: `${who} is covering${input.message ? `: ${input.message}` : '.'}`,
        url: '/calendar',
        tag: `cover-${String(req.subEvent)}`,
      }).catch(() => {});
    }
    return { ok: true, status: 'Filled' };
  },
});
