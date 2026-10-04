import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireAdmin, ids, mapShow, mapSubEvent } from '../lib/server';
import { noReplyNotice, automatedFooter } from '../lib/emails';
import { pendingForms } from '../lib/reminders';
import { claimNotification } from '../../server/push';
import { notifyFormDue } from '../../server/notify';

/**
 * Automatic form reminders (scheduled, daily).
 *
 * This is the piece that was missing: the admin "Remind of all forms" button
 * emailed one member by hand, and the hourly notification pass pushed about a
 * deadline, but nothing ever EMAILED a member automatically. Members who do not
 * have the app installed (so get no push) were never reminded at all.
 *
 * Runs daily at 17:00 Europe/London - after school, before the evening, which is
 * when a crew member will actually act on it. Reminds about anything due within
 * the next three days, and only once per member per deadline day, using the same
 * claim-once mechanism as the other notifications so a restart cannot double-send.
 */

const WARN_DAYS = 3;
const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const REPORT_EMAIL = 'NavaratneJ@ashpupil.co.uk';

export default createEndpoint({
  description: 'Scheduled: emails (and pushes) a reminder of forms due in the next few days',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  schedule: {
    scheduleType: 'recurring',
    // Daily at 17:00 Europe/London. atHour names the hour; interval alone would
    // only ever anchor to midnight.
    schedule: { frequency: 'hourly', interval: 24, atHour: 17 },
    timezone: 'Europe/London',
  },
  execute: async ({ context }) => {
    // Scheduled runs have no user; a manual run must be an admin.
    if (context.user) await requireAdmin(context.user.email);

    const now = Date.now();
    const horizon = now + WARN_DAYS * 86_400_000;

    const [shows, subs, resps, att, members] = await Promise.all([
      zite.shows.findAll({ limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ limit: 5000 }),
      zite.attendance.findAll({ limit: 5000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);
    const showList = shows.records.map(mapShow);
    const showName = (id: string) => showList.find((s) => s.id === id)?.name ?? '';

    let reminded = 0;
    for (const m of members.records) {
      if (m.isPreviewAccount || m.memberType === 'Actor') continue;
      if (!m.schoolEmail) continue;

      const pending = pendingForms(m.id, {
        shows: showList,
        subEvents: subs.records.map(mapSubEvent),
        responses: resps.records.map((r) => ({ memberId: m.id, showId: ids(r.show)[0] ?? '', response: r.response ?? '' })),
        attendance: att.records.map((a) => ({ memberId: m.id, subEventId: ids(a.subEvent)[0] ?? '', status: a.status ?? '' })),
      }).filter((p) => {
        const due = Date.parse(`${p.dueDate}T23:59:59Z`);
        return !Number.isNaN(due) && due >= now && due <= horizon;
      });
      if (!pending.length) continue;

      // One email per member per day, keyed by the earliest deadline so a
      // second run the same day is a no-op.
      const key = `email-${pending[0].dueDate}-${pending.length}`;
      if (!(await claimNotification(m.id, 'form-reminder-email', key))) continue;

      const lines = pending.map((p) => {
        const label = p.kind === 'show'
          ? `**${p.title}** — are you taking part?`
          : `**${p.title}** (${p.showIds.map(showName).join(', ')}) — attendance`;
        return `- ${label} · due **${fmt(p.dueDate)}**${p.maybe ? ' · _you said Maybe, please confirm Yes or No_' : ''}`;
      });
      const maybes = pending.filter((p) => p.maybe).length;
      const subject = `Reminder: ${pending.length} AshTec form${pending.length > 1 ? 's' : ''} to complete`;
      const text =
        `Hi ${m.firstName ?? ''},\n\nYou still have the following to complete on the AshTec Crew Hub:\n\n${lines.join('\n')}` +
        (maybes ? `\n\nYou answered **Maybe** to ${maybes} of these — please update to a firm Yes or No before the deadline.` : '') +
        `\n\n${noReplyNotice('Jacob', REPORT_EMAIL)}\n\n${automatedFooter()}`;

      try {
        await Email.send({
          to: m.schoolEmail,
          subject,
          body: [
            { type: 'text', content: text },
            { type: 'button', label: 'Open AshTec Crew Hub', href: process.env.APP_URL },
          ],
        });
        await zite.emailLog.create({
          record: {
            subject,
            member: m.id,
            recipientEmail: m.schoolEmail,
            purpose: 'Form Reminder',
            shows: [...new Set(pending.flatMap((p) => p.showIds))],
            body: text,
            sentBy: 'Automatic',
          } as never,
        });
        // And a push for anyone with the app installed.
        await notifyFormDue(m.id, { kind: pending[0].kind, title: pending[0].title, dueDate: pending[0].dueDate });
        reminded++;
      } catch (e) {
        console.error(`[formReminders] failed for ${m.schoolEmail}:`, e);
      }
    }
    return { reminded };
  },
});
