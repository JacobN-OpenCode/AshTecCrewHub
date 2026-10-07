import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireAdmin, ids, isStaff, mapShow, mapSubEvent } from '../lib/server';
import { noReplyNotice, automatedFooter } from '../lib/emails';
import { pendingForms } from '../lib/reminders';

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** Where a crew member should actually go instead of replying. */
const REPORT_EMAIL = 'NavaratneJ@ashpupil.co.uk';

export default createEndpoint({
  description: 'Emails a crew member a reminder of all forms they still need to complete (admins)',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string() }),
  outputSchema: z.object({ sent: z.number() }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const member = await zite.crewMembers.findOne({ id: input.memberId });
    if (!member?.schoolEmail) throw new Error('Member has no email address.');
    if (member.isPreviewAccount) throw new Error('Preview accounts can’t receive emails.');
    if (member.memberType === 'Actor') throw new Error('Actors don’t have crew forms.');
    if (isStaff(member)) throw new Error('Staff don’t have crew forms.');
    const [shows, subs, resps, att] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ filters: { member: member.id }, limit: 500 }),
      zite.attendance.findAll({ filters: { member: member.id }, limit: 2000 }),
    ]);
    const showList = shows.records.map(mapShow);
    const pending = pendingForms(member.id, {
      shows: showList,
      subEvents: subs.records.map(mapSubEvent),
      responses: resps.records.map((r) => ({ memberId: member.id, showId: ids(r.show)[0] ?? '', response: r.response ?? '' })),
      attendance: att.records.map((a) => ({ memberId: member.id, subEventId: ids(a.subEvent)[0] ?? '', status: a.status ?? '' })),
    });
    if (!pending.length) throw new Error('This member has nothing outstanding with a due date.');

    const showName = (id: string) => showList.find((s) => s.id === id)?.name ?? '';
    const lines = pending.map((p) => {
      const label = p.kind === 'show' ? `**${p.title}** — are you taking part?` : `**${p.title}** (${p.showIds.map(showName).join(', ')}) — attendance`;
      return `- ${label} · due **${fmt(p.dueDate)}**${p.maybe ? ' · _you said Maybe, please confirm Yes or No_' : ''}`;
    });
    const maybes = pending.filter((p) => p.maybe).length;
    const subject = `Reminder: ${pending.length} AshTec form${pending.length > 1 ? 's' : ''} to complete`;
    const text =
      `Hi ${member.firstName ?? ''},\n\nYou still have the following to complete on the AshTec Crew Hub:\n\n${lines.join('\n')}` +
      (maybes ? `\n\nYou answered **Maybe** to ${maybes} of these — please update to a firm Yes or No before the deadline.` : '') +
      `\n\n${noReplyNotice('Jacob', REPORT_EMAIL)}\n\n${automatedFooter()}`;

    await Email.send({
      to: member.schoolEmail,
      subject,
      body: [
        { type: 'text', content: text },
        { type: 'button', label: 'Open AshTec Crew Hub', href: process.env.APP_URL },
      ],
    });
    await zite.emailLog.create({
      record: {
        subject,
        member: member.id,
        recipientEmail: member.schoolEmail,
        purpose: 'Form Reminder',
        shows: [...new Set(pending.flatMap((p) => p.showIds))],
        body: text,
        sentBy: `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim(),
        sentAt: new Date().toISOString(),
      },
    });
    return { sent: pending.length };
  },
});
