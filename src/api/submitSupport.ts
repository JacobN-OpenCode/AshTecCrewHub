import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireMember, isEmailable, isStaff } from '../lib/server';
import { SUPPORT_MESSAGE_MAX, noReplyNotice } from '../lib/emails';
import { notifyNewTicket } from '../../server/notify';
import { getSupportSummaryMode, effectiveSupportMode } from '../../server/supportSummary';

export default createEndpoint({
  description: 'Submits a bug report, feature request or support request and emails the right people',
  authenticated: true,
  inputSchema: z.object({
    type: z.enum(['Bug Report', 'Feature Request', 'General Support']),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(SUPPORT_MESSAGE_MAX),
    page: z.string().optional(),
    // Ticket 5a04aaf1: up to four pictures, each a path our own uploader
    // returned. Anything that is not one of our uploads is dropped rather than
    // stored, so a ticket can never point at an arbitrary URL.
    attachments: z.array(z.string().max(500)).max(4).optional(),
    // Ticket 233ba926: submitters never set severity. How urgent something is
    // is for a maintainer to judge when they triage the ticket, so this stays
    // blank until an admin assigns it (adminUpdateTicket).
  }),
  outputSchema: z.object({ id: z.string(), notified: z.number() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim();
    // Ticket 5a04aaf1: only files this app stored, and only a handful.
    const attachments = (input.attachments ?? [])
      .map((u) => u.trim())
      .filter((u) => u.startsWith('/api/uploads/tickets/') && !u.includes('..'))
      .slice(0, 4);
    const ticket = await zite.supportTickets.create({
      // Ticket 93919113: submittedAt was never set, so "Your support tickets"
      // sorted on empty strings and looked unsorted. Stamp it at raise time.
      record: {
        subject: input.subject.trim(), type: input.type, severity: '', message: input.message.trim(),
        submittedBy: me.id, status: 'Open', page: input.page ?? '', submittedAt: new Date().toISOString(),
        attachments: attachments.join(','),
      } as never,
    });
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const adminsNoStaff = records.filter((m) => m.isAdmin && !isStaff(m) && isEmailable(m));
    // Only bugs page the maintainers; feature requests and general support go to
    // the admins who aren't staff.
    const candidates = input.type === 'Bug Report' ? records.filter((m) => m.isMaintainer && isEmailable(m)) : adminsNoStaff;
    // Ticket 42ca4f1f: never email a maintainer about a ticket they raised
    // themselves. If excluding the sender would notify nobody, fall back to the
    // admins (still without the sender) so a lone maintainer's own ticket is
    // simply not broadcast back to them.
    let recipients = candidates.filter((m) => m.id !== me.id);
    if (!recipients.length) recipients = adminsNoStaff.filter((m) => m.id !== me.id);

    // Ticket f505c30e: when the admin has chosen a daily summary, do not email
    // each maintainer per ticket. The push still goes out (that is a glanceable
    // ping, not an inbox), and supportDigest sends the one combined email.
    const summaryMode = await getSupportSummaryMode();
    // Ticket d1ae2a76 / 09b3e402: each recipient's own choice wins over the site
    // default, so one person can take a daily summary while everyone else still
    // gets the per-ticket email.
    const perTicket = recipients.filter(
      (m) => effectiveSupportMode((m as { supportEmailMode?: string }).supportEmailMode, summaryMode) === 'per-ticket',
    );

    // The save must not wait on outbound mail: a bug report can take several
    // seconds to email every maintainer sequentially, which made the dialog
    // hang on "Send". The ticket is already stored, so notify in the
    // background and reply with how many people we are telling.
    void (async () => {
      if (perTicket.length) {
        const subject = `[${input.type}] ${input.subject.trim()} - AshTec Support`;
        const quoted = input.message.trim().split('\n').map((l) => `> ${l}`).join('\n');
        const body =
          `**${who}** (${me.schoolEmail}) submitted a **${input.type.toLowerCase()}**` +
          (input.page ? ` from the \`${input.page}\` page` : '') + `:\n\n**${input.subject.trim()}**\n\n${quoted}\n\n---\n\n` +
          (attachments.length ? `They attached ${attachments.length} picture${attachments.length === 1 ? '' : 's'} - open the ticket to see ${attachments.length === 1 ? 'it' : 'them'}.\n\n` : '') +
          `Track and update it in the Support tab.\n\n${noReplyNotice('the AshTec crew', '')}\n\n` +
          `To answer them, reply to ${who} directly at [${me.schoolEmail}](mailto:${me.schoolEmail}).`;
        const logs: Record<string, unknown>[] = [];
        const sends = perTicket.map(async (r) => {
          try {
            await Email.send({ to: r.schoolEmail!, subject, body: [{ type: 'text', content: body }, { type: 'button', label: 'Open Support tab', href: `${process.env.APP_URL}/admin/support` }] });
            logs.push({ subject, member: r.id, recipientEmail: r.schoolEmail, purpose: 'Support', body, sentBy: who, sentAt: new Date().toISOString(), batchId: perTicket.length > 1 ? ticket.id : '' });
          } catch { /* keep going */ }
        });
        await Promise.all(sends).catch(() => {});
        if (logs.length) await zite.emailLog.bulkCreate({ records: logs as never }).catch(() => {});
      }
      // Push as well as email: a bug report reaches the maintainers straight
      // away, and feature requests and general support reach the admins.
      await notifyNewTicket({ id: ticket.id, type: input.type, subject: input.subject.trim(), submittedBy: me.id });
    })();

    return { id: ticket.id, notified: perTicket.length };
  },
});
