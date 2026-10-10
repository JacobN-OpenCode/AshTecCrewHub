import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, findMemberByEmail } from '../lib/server';
import { openLiveShow, mapMessage, loadLiveShowMessages } from '../lib/liveShow';
import { verifyAdminSecret } from '../../server/catLogin.js';

const CHAT_MAX = 500;

/**
 * Post to the live show chat (ticket f75f7b40). The chat is public to read but
 * only admins may write. There are two ways to prove you are an admin:
 *
 *   - a normal signed-in session, which the stage dashboard already has; or
 *   - an admin email plus that admin's cat-login secret, so a stage machine
 *     that is not signed in can post as its owner after the 5-spacebar
 *     unlock. verifyAdminSecret confirms both the secret and the admin flag
 *     without minting a cookie.
 *
 * Either path attaches a real member as the author, so a message always has a
 * name on it.
 */
export default createEndpoint({
  description: 'Post a message to the live show chat (admins)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    body: z.string().min(1).max(CHAT_MAX),
    email: z.string().email().optional(),
    secret: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');

    let authorId: string;
    let authorName: string;
    if (context.user) {
      const me = await requireMember(context.user.email);
      if (!me.isAdmin) throw new Error('Only admins can post to the live show chat.');
      authorId = me.id;
      authorName = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || 'Admin';
    } else {
      const email = (input.email ?? '').trim();
      const secret = input.secret ?? '';
      if (!email || !secret) throw new Error('Sign in, or give an admin email and cat-login secret.');
      const member = await findMemberByEmail(email);
      if (!member?.isAdmin) throw new Error('Only admins can post to the live show chat.');
      if (!(await verifyAdminSecret(email, secret))) throw new Error('Those admin details are not right.');
      authorId = member.id;
      authorName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Admin';
    }

    const body = input.body.trim().slice(0, CHAT_MAX);
    if (!body) throw new Error('Write something first.');
    const message = await zite.liveShowMessages.create({
      record: { liveShowId: liveShow.id, author: authorId, authorName, body, kind: 'chat' },
    });
    return { message: mapMessage(message), messages: await loadLiveShowMessages(liveShow.id) };
  },
});
