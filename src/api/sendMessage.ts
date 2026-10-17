import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember } from '../lib/server';
import { notifyDirectMessage } from '../../server/notify';

/**
 * Send a direct message to another member (Batch 7). Not allowed to message
 * yourself or a preview account (a puppet, not a person). The recipient gets a
 * push unless they have muted the messages kind.
 */
export default createEndpoint({
  description: 'Send a direct message to another member',
  authenticated: true,
  inputSchema: z.object({ toId: z.string(), body: z.string().min(1).max(4000) }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const toId = input.toId;
    if (toId === me.id) throw new Error('You cannot message yourself.');

    const to = await zite.crewMembers.findOne({ id: toId });
    if (!to) throw new Error('That member could not be found.');
    if (to.isPreviewAccount) throw new Error('You cannot message a preview account.');

    const body = input.body.trim().slice(0, 4000);
    if (!body) throw new Error('Your message is empty.');

    const created = await zite.directMessages.create({
      record: { from: me.id, to: toId, body } as never,
    });
    const id = String(created.id);

    const fromName = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || mapMember(me).email;
    try {
      await notifyDirectMessage({ id, toId, fromId: me.id, fromName, body });
    } catch {
      /* the message is stored regardless */
    }
    return { ok: true, id };
  },
});
