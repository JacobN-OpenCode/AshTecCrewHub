import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids } from '../lib/server';
import { REPLY_KIND } from '../lib/support';

/** A finished ticket is never "awaiting" a reply, whatever its last word was. */
const ACTIVE_STATUSES = ['Open', 'In Progress'];

export default createEndpoint({
  description: 'Lists all support tickets, newest first (admins)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    tickets: z.array(z.object({
      id: z.string(), subject: z.string(), type: z.string(), message: z.string(), status: z.string(),
      severity: z.string(), adminNotes: z.string(), page: z.string(), submittedById: z.string(), submittedAt: z.string(),
      assignedMaintainerIds: z.array(z.string()), replyCount: z.number(), awaitingReply: z.boolean(),
      maintainerTurn: z.boolean(),
      pinned: z.boolean(),
      lastReplyAt: z.string(), lastReplyFrom: z.string(), escalatedAt: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);
    const { records } = await zite.supportTickets.findAll({ limit: 2000 });
    const { records: replyRows } = await zite.supportReplies.findAll({ limit: 2000 });
    const byTicket = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const tid = ids(r.ticket)[0];
      if (!tid) continue;
      const g = byTicket.get(tid);
      if (g) g.push(r); else byTicket.set(tid, [r]);
    }
    return {
      tickets: records.map((t) => {
        const replies = (byTicket.get(t.id) ?? [])
          .filter((r) => r.kind !== REPLY_KIND.note)
          .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
        const newest = replies[0];
        return {
          id: t.id, subject: t.subject ?? '', type: t.type ?? 'General Support', message: t.message ?? '',
          status: t.status ?? 'Open', severity: (t as { severity?: string }).severity ?? '',
          adminNotes: t.adminNotes ?? '', page: t.page ?? '',
          submittedById: ids(t.submittedBy)[0] ?? '', submittedAt: t.submittedAt ?? t.createdAt ?? '',
          assignedMaintainerIds: ids(t.assignedMaintainers),
          replyCount: replies.length,
          pinned: !!(t as { pinned?: boolean }).pinned,
          // Finished tickets can keep an unanswered last word, so they must not
          // count - this has to agree with the badge count in getMe.
          // Ticket 7bb46cad: "waiting on the reporter" means we answered and the
          // next move is theirs. A ticket nobody has replied to is waiting on us,
          // not on them, so a real reply from a maintainer has to exist first.
          awaitingReply: ACTIVE_STATUSES.includes(t.status ?? 'Open') && !!newest && newest.kind === REPLY_KIND.toUser,
          // The maintainer's turn, by the same rule the "Remind maintainers"
          // digest uses: still active, and the last real message is not from a
          // maintainer (ticket edf25b3d - the old filter bound this to
          // awaitingReply, which is the opposite question and so never matched
          // the checkbox's label).
          maintainerTurn: ACTIVE_STATUSES.includes(t.status ?? 'Open') && (!newest || newest.kind === REPLY_KIND.fromUser),
          lastReplyAt: t.lastReplyAt ?? '', lastReplyFrom: t.lastReplyFrom ?? '', escalatedAt: t.escalatedAt ?? '',
        };
      }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    };
  },
});
