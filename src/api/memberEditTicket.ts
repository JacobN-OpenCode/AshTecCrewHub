import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite, type CrewMembersRecordType } from '#db';
import { Email } from '#email';
import { requireMember, isEmailable, isStaff, ids } from '../lib/server';
import { SUPPORT_MESSAGE_MAX, noReplyNotice } from '../lib/emails';
import { notifyTargets } from '../lib/support';
import { notifyTicketEdited } from '../../server/notify';

const EDITABLE = ['Open', 'In Progress'];

/**
 * Lets the person who raised a ticket fix a typo or add detail, and tells the
 * crew who look after that kind of ticket. Only tickets nobody has finished
 * with can be edited; a resolved or closed ticket is a record, not a draft
 * (5b5f0c2a).
 */
export default createEndpoint({
  description: 'Updates the subject and message of the caller’s own still-open ticket and notifies the crew',
  authenticated: true,
  inputSchema: z.object({
    id: z.string(),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(SUPPORT_MESSAGE_MAX),
  }),
  outputSchema: z.object({ edited: z.boolean() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim();

    const { records } = await zite.supportTickets.findAll({ limit: 2000 });
    const ticket = records.find((t) => t.id === input.id);
    if (!ticket) throw new Error('That ticket no longer exists.');
    if (ids(ticket.submittedBy)[0] !== me.id) throw new Error('Only the person who raised a ticket can edit it.');
    if (!EDITABLE.includes(ticket.status ?? 'Open')) throw new Error('This ticket has been finished, so it can no longer be edited.');

    const subject = input.subject.trim();
    const message = input.message.trim();
    const changed: string[] = [];
    if (subject !== (ticket.subject ?? '')) changed.push('subject');
    if (message !== (ticket.message ?? '')) changed.push('message');
    if (!changed.length) return { edited: false };

    await zite.supportTickets.update({
      id: ticket.id,
      record: { subject, message } as never,
    });
    const sentAt = new Date().toISOString();
    await zite.supportReplies.create({
      record: {
        ticket: ticket.id, author: me.id, kind: 'Internal Note',
        body: `${who} updated the ${changed.join(' and ')}.`, recipients: '', sentAt,
      } as never,
    });

    // Tell the people who handle this kind of ticket, off the critical path.
    void (async () => {
      const { records: c } = await zite.crewMembers.findAll({ limit: 2000 });
      const all = c as unknown as CrewMembersRecordType[];
      let recipients = notifyTargets(ids(ticket.assignedMaintainers), all);
      if (!recipients.length) recipients = all.filter((m) => m.isAdmin && !isStaff(m) && isEmailable(m));
      recipients = recipients.filter((m) => isEmailable(m));
      if (!recipients.length) return;
      const mailSubject = `Updated: [${ticket.type ?? 'support'}] ${subject} - AshTec Support`;
      const body =
        `**${who}** updated their **${(ticket.type ?? 'support').toLowerCase()}** ` +
        `“${subject}”${changed.includes('message') ? ' and changed the details' : ''}:\n\n${message}\n\n---\n\n` +
        `${noReplyNotice('the AshTec crew', '')}`;
      const logs: Record<string, unknown>[] = [];
      await Promise.all(recipients.map(async (r) => {
        const email = r.schoolEmail;
        if (!email) return;
        try {
          await Email.send({ to: email, subject: mailSubject, body: [{ type: 'text', content: body }, { type: 'button', label: 'Open the ticket', href: `${process.env.APP_URL}/admin/support/${ticket.id}` }] });
          logs.push({ subject: mailSubject, member: r.id, recipientEmail: email, purpose: 'Support Edit', body, sentBy: who, sentAt, batchId: '' });
        } catch { /* keep going */ }
      })).catch(() => {});
      if (logs.length) await zite.emailLog.bulkCreate({ records: logs as never }).catch(() => {});
      await notifyTicketEdited({ id: ticket.id, type: ticket.type ?? undefined, subject });
    })();

    return { edited: true };
  },
});