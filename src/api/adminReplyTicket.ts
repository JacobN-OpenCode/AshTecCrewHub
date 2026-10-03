import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Email } from 'zitejs/email';
import { requireAdmin, ids } from '../lib/server';
import { REPLY_KIND, ticketUrl, fullName } from '../lib/support';
import { SUPPORT_MESSAGE_MAX, noReplyNotice, automatedFooter } from '../lib/emails';

export default createEndpoint({
  description: 'Emails a support reply to the person who raised a ticket and records it on the thread (admins)',
  authenticated: true,
  inputSchema: z.object({ id: z.string(), message: z.string().min(1).max(SUPPORT_MESSAGE_MAX) }),
  outputSchema: z.object({ sent: z.boolean(), messageId: z.string() }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const adminName = fullName(admin);
    const adminEmail = admin.schoolEmail ?? context.user.email;

    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const ticket = tickets.find((t) => t.id === input.id);
    if (!ticket) throw new Error('That ticket no longer exists.');
    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    const submitter = members.find((m) => m.id === ids(ticket.submittedBy)[0]);
    if (!submitter?.schoolEmail) throw new Error('That ticket has no reachable submitter.');

    const quoted = (ticket.message ?? '').split('\n').map((l) => `> ${l}`).join('\n');
    const body =
      `Hi ${submitter.firstName ?? ''}! ${adminName} from the AshTec crew has replied to your ` +
      `**${(ticket.type ?? 'support').toLowerCase()}** “${ticket.subject}”:\n\n${input.message.trim()}\n\n` +
      `Your original message:\n\n${quoted}\n\n---\n\n${noReplyNotice(adminName, adminEmail)}\n\n${automatedFooter()}`;

    const subject = `Re: [${ticket.type}] ${ticket.subject} - AshTec Support`;
    const result = await Email.send({
      to: submitter.schoolEmail,
      replyTo: adminEmail,
      subject,
      body: [
        { type: 'text', content: body },
        { type: 'button', label: 'View this ticket', href: ticketUrl(ticket.id) },
      ],
    });

    const sentAt = new Date().toISOString();
    await zite.supportReplies.create({
      record: {
        ticket: ticket.id, author: admin.id, kind: REPLY_KIND.toUser,
        body: input.message.trim(), recipients: submitter.schoolEmail, sentAt,
        emailMessageId: result?.messageId ?? '',
      } as never,
    });
    await zite.emailLog.create({
      record: {
        subject, member: submitter.id, recipientEmail: submitter.schoolEmail, purpose: 'Support Reply',
        body, sentBy: adminName, batchId: '',
      } as never,
    });
    // Replying re-arms the escalation clock and moves an untouched ticket along.
    await zite.supportTickets.update({
      id: ticket.id,
      record: {
        lastReplyAt: sentAt, lastReplyFrom: 'Maintainer',
        ...(ticket.status === 'Open' ? { status: 'In Progress' } : {}),
      } as never,
    });
    return { sent: true, messageId: result?.messageId ?? '' };
  },
});
