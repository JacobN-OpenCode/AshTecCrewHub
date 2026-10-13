import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireAdmin, ids, isEmailable } from '../lib/server';
import { fullName } from '../lib/support';
import { noReplyNotice, automatedFooter } from '../lib/emails';
import { getSupportSummaryMode, getLastDigestDate, setLastDigestDate } from '../../server/supportSummary';

/**
 * Ticket f505c30e: the daily support digest.
 *
 * If an admin has switched the support emails to "daily", submitSupport stops
 * emailing each maintainer per ticket and this job sends one combined email a
 * day instead. Scheduled as an hourly job pinned to 08:00 (the scheduler's daily
 * idiom - see server/index.ts), guarded by a stored last-sent date so a server
 * restart inside that hour cannot resend it.
 */

const DIGEST_HOUR = 8; // Europe/London, matching the schedule below.

export default createEndpoint({
  description: 'Scheduled: emails one daily summary of new support tickets (server only)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'hourly', interval: 1, atHour: DIGEST_HOUR },
    timezone: 'Europe/London',
  },
  execute: async ({ context }) => {
    if (context.user) await requireAdmin(context.user.email);

    const mode = await getSupportSummaryMode();
    if (mode !== 'daily') return { skipped: 'per-ticket mode' };

    const today = new Date().toISOString().slice(0, 10);
    if ((await getLastDigestDate()) === today) return { skipped: 'already sent today' };

    // Tickets raised in the last 24 hours. createdAt is the reliable timestamp;
    // submittedAt is stamped by submitSupport but older rows may lack it.
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const fresh = tickets
      .filter((t) => {
        const ts = Date.parse(t.submittedAt ?? t.createdAt ?? '');
        return !Number.isNaN(ts) && ts >= since;
      })
      .sort((a, b) => (b.submittedAt ?? b.createdAt ?? '').localeCompare(a.submittedAt ?? a.createdAt ?? ''));

    // Stamp even when there is nothing to send, so the day is not re-checked on
    // every subsequent tick.
    await setLastDigestDate(today);
    if (!fresh.length) return { date: today, count: 0, sent: 0 };

    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
    // Union of the two per-ticket audiences: admins (non-staff) and maintainers.
    const recipients = members.filter(
      (m) => (m.isAdmin || m.isMaintainer) && !m.isPreviewAccount && isEmailable(m),
    );
    const who = new Map(members.map((m) => [m.id, fullName(m)!]));

    const byType = fresh.reduce<Record<string, number>>((acc, t) => {
      const k = t.type ?? 'General Support';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(byType).map(([k, n]) => `${n} ${k.toLowerCase()}${n === 1 ? '' : 's'}`).join(', ');

    const lines = fresh.map((t) => {
      const submitter = who.get(ids(t.submittedBy)[0] ?? '') ?? 'Someone';
      const message = (t.message ?? '').trim().replace(/\s+/g, ' ');
      const excerpt = message.length > 160 ? `${message.slice(0, 157)}...` : message;
      return `- **[${t.type ?? 'General Support'}] ${t.subject ?? '(no subject)'}** — ${submitter}\n  ${excerpt}`;
    });

    const subject = `Support summary - ${fresh.length} new ticket${fresh.length === 1 ? '' : 's'} (${today})`;
    const body =
      `**${fresh.length} new support ticket${fresh.length === 1 ? '' : 's'}** in the last day: ${summary}.\n\n` +
      `${lines.join('\n\n')}\n\n---\n\n` +
      `Open the [Support tab](${process.env.APP_URL}/admin/support) to triage them.\n\n` +
      `${noReplyNotice('the AshTec crew', '')}\n\n${automatedFooter()}`;
    const buttons = [{ type: 'text' as const, content: body }, { type: 'button' as const, label: 'Open Support tab', href: `${process.env.APP_URL}/admin/support` }];

    const logs: Record<string, unknown>[] = [];
    await Promise.all(
      recipients.map(async (r) => {
        try {
          await Email.send({ to: r.schoolEmail!, subject, body: buttons });
          logs.push({
            subject, member: r.id, recipientEmail: r.schoolEmail, purpose: 'Support', body,
            sentBy: 'Support digest', sentAt: new Date().toISOString(), batchId: `digest-${today}`,
          });
        } catch { /* keep going */ }
      }),
    );
    if (logs.length) await zite.emailLog.bulkCreate({ records: logs as never }).catch(() => {});

    return { date: today, count: fresh.length, sent: logs.length };
  },
});
