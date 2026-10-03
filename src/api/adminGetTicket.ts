import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';
import { REPLY_KIND, fullName } from '../lib/support';
import { ids } from '../lib/server';

const person = (m: { id: string; firstName?: string | null; lastName?: string | null; schoolEmail?: string | null; isMaintainer?: boolean | null; isAdmin?: boolean | null; isPreview?: boolean | null } | undefined) =>
  m ? { id: m.id, name: fullName(m), email: m.schoolEmail ?? '', isMaintainer: !!m.isMaintainer, isAdmin: !!m.isAdmin } : null;

export default createEndpoint({
  description: 'Returns one support ticket with its full reply thread and the maintainer list (admins)',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    ticket: z.any().nullable(),
    replies: z.array(z.any()),
    submitter: z.any().nullable(),
    maintainers: z.array(z.any()),
  }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const ticket = tickets.find((t) => t.id === input.id);
    if (!ticket) return { ticket: null, replies: [], submitter: null, maintainers: [] };

    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    const nameOf = new Map(members.map((m) => [m.id, fullName(m)]));

    const { records: replyRows } = await zite.supportReplies.findAll({ limit: 2000 });
    const replies = replyRows
      .filter((r) => ids(r.ticket).includes(input.id))
      .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
      .map((r) => {
        const authorId = ids(r.author)[0] ?? '';
        return { id: r.id, kind: r.kind ?? REPLY_KIND.note, body: r.body ?? '', recipients: r.recipients ?? '', sentAt: r.sentAt ?? '', authorId, authorName: nameOf.get(authorId) ?? 'System' };
      });

    return {
      ticket: {
        id: ticket.id, subject: ticket.subject ?? '', type: ticket.type ?? 'General Support',
        message: ticket.message ?? '', status: ticket.status ?? 'Open', adminNotes: ticket.adminNotes ?? '',
        page: ticket.page ?? '', submittedAt: ticket.submittedAt ?? '',
        referToOpencode: !!(ticket as { referToOpencode?: boolean }).referToOpencode,
        assignedMaintainerIds: ids(ticket.assignedMaintainers),
        lastReplyAt: ticket.lastReplyAt ?? '', lastReplyFrom: ticket.lastReplyFrom ?? '', escalatedAt: ticket.escalatedAt ?? '',
      },
      replies,
      submitter: person(members.find((m) => m.id === ids(ticket.submittedBy)[0])),
      maintainers: members.filter((m) => m.isAdmin && !m.isPreviewAccount).map(person).filter((p): p is NonNullable<typeof p> => p !== null),
    };
  },
});
