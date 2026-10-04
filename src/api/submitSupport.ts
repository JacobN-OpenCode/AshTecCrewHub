import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireMember, isEmailable, isStaff } from '../lib/server';
import { SUPPORT_MESSAGE_MAX, noReplyNotice } from '../lib/emails';
import { notifyNewTicket } from '../../server/notify';

export default createEndpoint({
  description: 'Submits a bug report, feature request or support request and emails the right people',
  authenticated: true,
  inputSchema: z.object({
    type: z.enum(['Bug Report', 'Feature Request', 'General Support']),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(SUPPORT_MESSAGE_MAX),
    page: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string(), notified: z.number() }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim();
    const ticket = await zite.supportTickets.create({
      record: { subject: input.subject.trim(), type: input.type, message: input.message.trim(), submittedBy: me.id, status: 'Open', page: input.page ?? '' } as never,
    });
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const adminsNoStaff = records.filter((m) => m.isAdmin && !isStaff(m) && isEmailable(m));
    let recipients = input.type === 'General Support' ? adminsNoStaff : records.filter((m) => m.isMaintainer && isEmailable(m));
    if (!recipients.length) recipients = adminsNoStaff;

    const subject = `[${input.type}] ${input.subject.trim()} - AshTec Support`;
    const quoted = input.message.trim().split('\n').map((l) => `> ${l}`).join('\n');
    const body =
      `**${who}** (${me.schoolEmail}) submitted a **${input.type.toLowerCase()}**` +
      (input.page ? ` from the \`${input.page}\` page` : '') + `:\n\n**${input.subject.trim()}**\n\n${quoted}\n\n---\n\n` +
      `Track and update it in the Support tab.\n\n${noReplyNotice('the AshTec crew', '')}\n\n` +
      `To answer them, reply to ${who} directly at [${me.schoolEmail}](mailto:${me.schoolEmail}).`;
    const logs: Record<string, unknown>[] = [];
    for (const r of recipients) {
      try {
        await Email.send({ to: r.schoolEmail!, subject, body: [{ type: 'text', content: body }, { type: 'button', label: 'Open Support tab', href: `${process.env.APP_URL}/admin/support` }] });
        logs.push({ subject, member: r.id, recipientEmail: r.schoolEmail, purpose: 'Support', body, sentBy: who, batchId: recipients.length > 1 ? ticket.id : '' });
      } catch { /* keep going */ }
    }
    if (logs.length) await zite.emailLog.bulkCreate({ records: logs as never });
    // Push as well as email: a feature request or bug report reaches the
    // maintainers straight away, and General Support reaches the admins.
    await notifyNewTicket({ id: ticket.id, type: input.type, subject: input.subject.trim(), submittedBy: me.id });
    return { id: ticket.id, notified: logs.length };
  },
});
