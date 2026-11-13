import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite, type CrewMembersRecordType } from '#db';
import { requireAdmin, ids } from '../lib/server';
import { REPLY_KIND, fullName } from '../lib/support';

/**
 * Everything an open ticket has, in one payload, so an admin can hand the whole
 * backlog to someone else (or to a coding agent) without opening each ticket.
 *
 * Unlike adminGetSupport this keeps internal notes and the admin scratchpad,
 * because the point is a complete record rather than a list to triage from.
 */
const person = (m: CrewMembersRecordType | undefined) =>
  m ? { id: String(m.id), name: fullName(m), email: m.schoolEmail ?? '' } : null;

export default createEndpoint({
  description: 'Exports every open support ticket with its full thread, for download (admins)',
  authenticated: true,
  inputSchema: z.object({
    // Defaults to Open only. Pass ['Open', 'In Progress'] to widen it.
    statuses: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    generatedAt: z.string(),
    generatedBy: z.string(),
    statuses: z.array(z.string()),
    count: z.number(),
    tickets: z.array(z.any()),
  }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const statuses = input.statuses?.length ? input.statuses : ['Open'];

    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const { records: replyRows } = await zite.supportReplies.findAll({ limit: 2000 });
    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });

    const memberById = new Map(members.map((m) => [m.id, m]));
    const nameOf = (id: string) => {
      const m = memberById.get(id);
      return m ? fullName(m) : '';
    };

    const repliesByTicket = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const tid = ids(r.ticket)[0];
      if (!tid) continue;
      const g = repliesByTicket.get(tid);
      if (g) g.push(r); else repliesByTicket.set(tid, [r]);
    }

    const picked = tickets
      .filter((t) => statuses.includes(t.status ?? 'Open'))
      .sort((a, b) => (a.submittedAt ?? a.createdAt ?? '').localeCompare(b.submittedAt ?? b.createdAt ?? ''));

    return {
      generatedAt: new Date().toISOString(),
      generatedBy: fullName(admin),
      statuses,
      count: picked.length,
      tickets: picked.map((t) => {
        const submitterId = ids(t.submittedBy)[0] ?? '';
        const assignedIds = ids(t.assignedMaintainers);
        const replies = (repliesByTicket.get(t.id) ?? [])
          .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
          .map((r) => {
            const authorId = ids(r.author)[0] ?? '';
            return {
              kind: r.kind ?? REPLY_KIND.note,
              author: nameOf(authorId) || 'System',
              sentAt: r.sentAt ?? '',
              recipients: r.recipients ?? '',
              body: r.body ?? '',
            };
          });

        return {
          id: t.id,
          subject: t.subject ?? '',
          type: t.type ?? 'General Support',
          status: t.status ?? 'Open',
          severity: (t as { severity?: string }).severity ?? '',
          page: t.page ?? '',
          submittedAt: t.submittedAt ?? t.createdAt ?? '',
          submitter: person(memberById.get(submitterId)) ?? { id: submitterId, name: '', email: '' },
          assignedTo: assignedIds.map((id) => ({ id, name: nameOf(id) })),
          referToOpencode: !!(t as { referToOpencode?: boolean }).referToOpencode,
          pinned: !!(t as { pinned?: boolean }).pinned,
          lastReplyAt: t.lastReplyAt ?? '',
          lastReplyFrom: t.lastReplyFrom ?? '',
          escalatedAt: t.escalatedAt ?? '',
          adminNotes: t.adminNotes ?? '',
          message: t.message ?? '',
          replies,
        };
      }),
    };
  },
});
