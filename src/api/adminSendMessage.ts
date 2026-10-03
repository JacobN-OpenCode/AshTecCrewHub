import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { Email } from 'zitejs/email';
import { requireAdmin, isEmailable } from '../lib/server';
import { noReplyNotice, automatedFooter } from '../lib/emails';

export default createEndpoint({
  description: 'Sends a message from an admin to selected crew members and logs it',
  authenticated: true,
  inputSchema: z.object({
    memberIds: z.array(z.string()).min(1).max(300),
    subject: z.string().min(1),
    message: z.string().min(1),
  }),
  outputSchema: z.object({ sent: z.number(), failed: z.number() }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const adminName = `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim();
    const adminEmail = admin.schoolEmail ?? context.user.email;
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const targets = records.filter((m) => input.memberIds.includes(m.id) && isEmailable(m));
    const subject = `${input.subject.trim()} - AshTec Management System`;
    const batchId = crypto.randomUUID();
    let sent = 0, failed = 0;
    const logs: Record<string, unknown>[] = [];

    for (const m of targets) {
      const quoted = input.message.trim().split('\n').map((l) => `> ${l}`).join('\n');
      const body =
        `Hi ${m.firstName ?? ''}! You have a message from ${adminName}. They said:\n\n${quoted}\n\n---\n\n` +
        `${noReplyNotice(adminName, adminEmail)}\n\n` +
        automatedFooter();
      try {
        await Email.send({
          to: m.schoolEmail!,
          subject,
          body: [
            { type: 'text', content: body },
            { type: 'button', label: 'Open AshTec Crew Hub', href: process.env.ZITE_APP_URL },
          ],
        });
        sent++;
        logs.push({ subject, member: m.id, recipientEmail: m.schoolEmail, purpose: 'Admin Message', body, sentBy: adminName, batchId: targets.length > 1 ? batchId : '' });
      } catch {
        failed++;
      }
    }
    for (let i = 0; i < logs.length; i += 100) await zite.emailLog.bulkCreate({ records: logs.slice(i, i + 100) as never });
    return { sent, failed };
  },
});
