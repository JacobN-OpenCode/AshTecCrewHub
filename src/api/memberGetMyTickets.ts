import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';

/** A ticket can be edited by its sender until a maintainer finishes with it. */
const EDITABLE = ['Open', 'In Progress'];

export default createEndpoint({
  description: 'Lists the caller’s own support tickets, newest first, with which are still editable by them',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const { records } = await zite.supportTickets.findAll({ limit: 2000 });
    const { records: replyRows } = await zite.supportReplies.findAll({ limit: 2000 });
    const byTicket = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const tid = ids(r.ticket)[0];
      if (!tid) continue;
      const g = byTicket.get(tid);
      if (g) g.push(r); else byTicket.set(tid, [r]);
    }
    const mine = records
      .filter((t) => ids(t.submittedBy)[0] === me.id)
      .map((t) => {
        const replies = (byTicket.get(t.id) ?? []).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
        const newest = replies[0];
        return {
          id: t.id,
          subject: t.subject ?? '',
          type: t.type ?? 'General Support',
          message: t.message ?? '',
          status: t.status ?? 'Open',
          page: t.page ?? '',
          submittedAt: t.submittedAt ?? '',
          editable: EDITABLE.includes(t.status ?? 'Open'),
          replyCount: replies.length,
          lastReplyFrom: newest?.kind === 'To User' ? 'Maintainer' : '',
        };
      })
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return { ticketCount: mine.length, tickets: mine };
  },
});