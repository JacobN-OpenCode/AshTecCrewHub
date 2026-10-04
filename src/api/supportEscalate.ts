import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireAdmin, ids, isEmailable } from '../lib/server';
import { REPLY_KIND, notifyTargets, isDueForEscalation, ticketUrl, fullName } from '../lib/support';
import { noReplyNotice, automatedFooter } from '../lib/emails';

const APP = process.env.APP_URL;

export default createEndpoint({
  description: 'Hourly job that nudges maintainers about support tickets nobody has answered for 12 hours',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ escalated: z.number(), checked: z.number() }),
  // Runs hourly on its own; admins can also trigger it by hand.
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'hourly', interval: 1 },
    timezone: 'Europe/London',
  },
  execute: async ({ context }) => {
    // A scheduled run has no signed-in user; a manual one must be an admin.
    if (context.user) await requireAdmin(context.user.email);

    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const open = tickets.filter((t) => ['Open', 'In Progress'].includes(t.status ?? 'Open') && isDueForEscalation({
      submittedAt: t.submittedAt, lastReplyAt: t.lastReplyAt, escalatedAt: t.escalatedAt,
    }));
    if (!open.length) return { escalated: 0, checked: tickets.length };

    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    let escalated = 0;
    for (const ticket of open) {
      const targets = notifyTargets(ids(ticket.assignedMaintainers), members).filter((m) => isEmailable(m));
      if (!targets.length) continue;
      const names = targets.map(fullName).filter(Boolean).join(', ');
      const submitterName = fullName(members.find((m) => m.id === ids(ticket.submittedBy)[0]) ?? { firstName: '', lastName: '' }) || 'A crew member';
      const body =
        `**${submitterName}** is waiting on a reply to this ${(ticket.type ?? 'support').toLowerCase()}, ` +
        `first raised ${ticket.submittedAt ? new Date(ticket.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium' }) : 'a while ago'}:\n\n` +
        `**${ticket.subject}**\n\n> ${(ticket.message ?? '').split('\n')[0].slice(0, 300)}\n\n` +
        `Reply by email or add a note on the ticket. Assigning yourself to it stops the reminders.\n\n---\n\n` +
        `${noReplyNotice('the AshTec crew', '')}\n\n${automatedFooter()}`;
      const subject = `[Reminder] Still waiting on a reply: ${ticket.subject}`;

      let sent = 0;
      for (const m of targets) {
        try {
          const r = await Email.send({
            to: m.schoolEmail!, subject,
            body: [{ type: 'text', content: body }, { type: 'button', label: 'Open ticket', href: ticketUrl(ticket.id) }],
          });
          sent++;
          await zite.emailLog.create({
            record: { subject, member: m.id, recipientEmail: m.schoolEmail, purpose: 'Support Reply', body, sentBy: 'AshTec Support', batchId: targets.length > 1 ? ticket.id : '' } as never,
          });
        } catch { /* keep going */ }
      }
      if (sent) {
        await zite.supportTickets.update({ id: ticket.id, record: { escalatedAt: new Date().toISOString() } as never });
        await zite.supportReplies.create({
          record: { ticket: ticket.id, author: targets[0].id, kind: REPLY_KIND.note, body: `Escalated to ${names} — no maintainer reply for 12 hours.`, recipients: '', sentAt: new Date().toISOString() } as never,
        });
        escalated++;
      }
    }
    return { escalated, checked: tickets.length };
  },
});
