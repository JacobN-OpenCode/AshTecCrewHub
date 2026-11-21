/**
 * One-shot: post a public reply to a support ticket and mark it Resolved.
 * Mirrors the logic in adminReplyTicket but as a script, so we do not have
 * to chain a magic link in the deploy pipeline.
 *
 * Usage:  npx tsx scripts/resolve_ticket.ts <ticketId> "<reply>"
 *
 * Both args are required. The reply is short, public, and does not include
 * any PII, so it is safe to drop into a Slack channel or a log.
 */

import '../server/env.js';
import { db, closeDb, zite } from '../server/db/index.js';
import { Email } from '../server/email.js';
import { ids } from '../src/lib/server.js';
import { REPLY_KIND, ticketUrl, fullName } from '../src/lib/support.js';
import { noReplyNotice, automatedFooter } from '../src/lib/emails.js';

const [, , ticketId, messageArg] = process.argv;
if (!ticketId || !messageArg) {
  console.error('Usage: tsx scripts/resolve_ticket.ts <ticketId> "<reply>"');
  process.exit(2);
}

const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
const ticket = tickets.find((t) => t.id === ticketId);
if (!ticket) {
  console.error(`Ticket ${ticketId} not found.`);
  await closeDb();
  process.exit(1);
}

const submitterId = ids(ticket.submittedBy)[0];
const submitter = (await zite.crewMembers.findAll({ limit: 2000 })).records.find((m) => m.id === submitterId);
const submitterEmail = submitter?.schoolEmail;
const submitterName = submitter?.firstName ?? 'there';
const adminName = 'AshTec Crew Hub bot';
const adminEmail = process.env.EMAIL_FROM ?? 'crew@ashtec.hackclub.app';

const sentAt = new Date().toISOString();
const quoted = (ticket.message ?? '').split('\n').map((l) => `> ${l}`).join('\n');
const body = `Hi ${submitterName}! ${adminName} has updated your **${(ticket.type ?? 'support').toLowerCase()}** “${ticket.subject}”:\n\n${messageArg.trim()}\n\nYour original message:\n\n${quoted}\n\n---\n\n${noReplyNotice(adminName, adminEmail)}\n\n${automatedFooter()}`;
const subject = `Re: [${ticket.type}] ${ticket.subject} - AshTec Support`;

if (submitterEmail) {
  try {
    const result = await Email.send({
      to: submitterEmail,
      replyTo: adminEmail,
      subject,
      body: [
        { type: 'text', content: body },
        { type: 'button', label: 'View this ticket', href: ticketUrl(ticket.id) },
      ],
    });
    await zite.supportReplies.create({
      record: {
        ticket: ticket.id, author: null, kind: REPLY_KIND.toUser,
        body: messageArg.trim(), recipients: submitterEmail, sentAt,
        emailMessageId: result?.messageId ?? '',
      } as never,
    });
    await zite.emailLog.create({
      record: {
        subject, member: submitter?.id, recipientEmail: submitterEmail, purpose: 'Support Reply',
        body, sentBy: adminName, sentAt, batchId: '',
      } as never,
    });
    console.log(`Reply emailed to ${submitterEmail} (messageId=${result?.messageId ?? 'none'})`);
  } catch (e) {
    console.warn(`Email send failed (non-fatal):`, (e as Error).message);
  }
} else {
  console.log('Ticket has no reachable submitter email; recording reply without emailing.');
  await zite.supportReplies.create({
    record: {
      ticket: ticket.id, author: null, kind: REPLY_KIND.toUser,
      body: messageArg.trim(), recipients: '', sentAt,
      emailMessageId: '',
    } as never,
  });
}

await zite.supportTickets.update({
  id: ticket.id,
  record: { status: 'Resolved', lastReplyAt: sentAt, lastReplyFrom: 'Maintainer' } as never,
});

console.log(`Ticket ${ticketId} marked Resolved.`);
await closeDb();
