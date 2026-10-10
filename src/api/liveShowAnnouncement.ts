import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, findMemberByEmail } from '../lib/server';
import { openLiveShow, activeAnnouncements, loadLiveShowMessages } from '../lib/liveShow';
import { verifyAdminSecret } from '../../server/catLogin.js';

const BODY_MAX = 500;

/**
 * Put an announcement on the board (ticket f75f7b40). An announcement is a
 * banner every dashboard shows for a chosen time (0 = until cleared), and it is
 * also copied into the live chat log so it survives after the banner times out.
 * Clearing takes down whatever is currently up.
 */
export default createEndpoint({
  description: 'Raise or clear a live show announcement (admins)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    body: z.string().max(BODY_MAX).optional(),
    seconds: z.number().min(0).max(145).optional(),
    clear: z.boolean().optional(),
    email: z.string().email().optional(),
    secret: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');
    let adminId: string;
    let authorName: string;
    if (context.user) {
      const admin = await requireMember(context.user.email);
      if (!admin.isAdmin) throw new Error('Admins only.');
      adminId = admin.id;
      authorName = `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() || 'Admin';
    } else {
      const email = (input.email ?? '').trim();
      const secret = input.secret ?? '';
      if (!email || !secret) throw new Error('Sign in, or give an admin email and cat-login secret.');
      const member = await findMemberByEmail(email);
      if (!member?.isAdmin || !(await verifyAdminSecret(email, secret))) throw new Error('Those admin details are not right.');
      adminId = member.id;
      authorName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Admin';
    }

    if (input.clear) {
      const { records } = await zite.liveShowAnnouncements.findAll({ filters: { liveShowId: liveShow.id }, limit: 200 });
      const now = new Date().toISOString();
      for (const a of records) {
        if (!a.clearedAt) await zite.liveShowAnnouncements.update({ id: String(a.id), record: { clearedAt: now } });
      }
      return { announcements: [] };
    }

    const body = (input.body ?? '').trim().slice(0, BODY_MAX);
    if (!body) throw new Error('Write the announcement first.');
    // 0 = until cleared; otherwise 2 to 145 seconds.
    const seconds = input.seconds ? Math.min(145, Math.max(2, Math.floor(input.seconds))) : 0;
    const expiresAt = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
    await zite.liveShowAnnouncements.create({
      record: { liveShowId: liveShow.id, body, author: adminId, authorName, seconds, expiresAt },
    });
    // Mirror it into the chat so the message is still there once it times out.
    await zite.liveShowMessages.create({
      record: { liveShowId: liveShow.id, author: adminId, authorName, body, kind: 'announcement' },
    });
    return {
      announcements: await activeAnnouncements(liveShow.id),
      messages: await loadLiveShowMessages(liveShow.id),
    };
  },
});
