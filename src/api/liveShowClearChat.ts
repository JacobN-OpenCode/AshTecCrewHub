import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, findMemberByEmail } from '../lib/server';
import { openLiveShow, loadLiveShowMessages } from '../lib/liveShow';
import { verifyAdminSecret, credentialEmail } from '../../server/catLogin.js';

/**
 * Wipe the live show chat. Admins only, because it takes away something other
 * people wrote: the messages are deleted, not hidden, so the crew channel on
 * every screen goes back to "Nothing said yet."
 *
 * Same two ways to prove you are an admin as posting (liveShowChat): a signed-in
 * session, or an admin email plus that admin's cat-login secret, so the control
 * panel on a stage machine that is not signed in can still do it. Announcements
 * live in their own table and are untouched - clearing the chat must not drop an
 * announcement somebody is mid-way through reading.
 */
export default createEndpoint({
  description: 'Clear the live show chat (admins)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    email: z.string().email().optional(),
    memberId: z.string().optional(),
    secret: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');

    if (context.user) {
      const me = await requireMember(context.user.email);
      if (!me.isAdmin) throw new Error('Only admins can clear the live show chat.');
    } else {
      const email = await credentialEmail(input.email, input.memberId);
      const secret = input.secret ?? '';
      if (!email || !secret) throw new Error('Sign in, or give an admin email and cat-login secret.');
      const member = await findMemberByEmail(email);
      if (!member?.isAdmin) throw new Error('Only admins can clear the live show chat.');
      if (!(await verifyAdminSecret(email, secret))) throw new Error('Those admin details are not right.');
    }

    const { records } = await zite.liveShowMessages.findAll({ filters: { liveShowId: liveShow.id }, limit: 500 });
    const chat = records.filter((m) => (m.kind ?? 'chat') === 'chat');
    for (const m of chat) await zite.liveShowMessages.delete({ id: m.id });

    return { cleared: chat.length, messages: await loadLiveShowMessages(liveShow.id) };
  },
});
