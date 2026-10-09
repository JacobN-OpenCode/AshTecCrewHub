import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite, type CrewMembersRecordType } from '#db';
import { Email } from '#email';
import { requireAdmin, ids, isEmailable } from '../lib/server';
import { REPLY_KIND, notifyTargets, ticketUrl, fullName } from '../lib/support';
import { noReplyNotice, automatedFooter } from '../lib/emails';
import { notifySupportReminder } from '../../server/notify';

const ACTIVE = ['Open', 'In Progress'];

/**
 * A maintainer-side nudge (b9f059cf). Tickets sitting where only a maintainer
 * can move them - nobody has answered, or the person who raised it replied
 * last - get grouped into one email per maintainer, and the maintainers get a
 * push, so a quiet morning is one digest rather than a pile of tickets.
 * Calling this arms the hourly escalation clock (`escalatedAt`) so the pings
 * do not immediately double up.
 */
export default createEndpoint({
  description: 'Emails and pushes each maintainer a digest of the tickets that are waiting on them (admins)',
  authenticated: true,
  inputSchema: z.object({
    // Ticket 28cd7c54: restrict the reminder to specific tickets, so a
    // maintainer can nudge about one report instead of all of them. Omitted
    // (the list page button) keeps the original all-at-once digest.
    ids: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ reminded: z.number(), emailed: z.number() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const { records: tickets } = await zite.supportTickets.findAll({ limit: 2000 });
    const { records: replyRows } = await zite.supportReplies.findAll({ limit: 2000 });
    const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });

    const only = input.ids?.length ? new Set(input.ids) : null;

    const byTicket = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const tid = ids(r.ticket)[0];
      if (!tid) continue;
      const g = byTicket.get(tid);
      if (g) g.push(r); else byTicket.set(tid, [r]);
    }

    // The maintainer's turn, by the same rule the page's "waiting on a
    // maintainer" filter uses: active, and the last real message is not from a
    // maintainer (i.e. nobody has answered yet, or the sender replied last).
    const pending = tickets.filter((t) => {
      if (only && !only.has(t.id)) return false;
      if (!ACTIVE.includes(t.status ?? 'Open')) return false;
      const replies = (byTicket.get(t.id) ?? [])
        .filter((r) => r.kind !== REPLY_KIND.note)
        .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
      const newest = replies[0];
      return !newest || newest.kind === REPLY_KIND.fromUser;
    });
    if (!pending.length) return { reminded: 0, emailed: 0 };

    const all = members as unknown as CrewMembersRecordType[];
    const invoker = all.find((m) => m.schoolEmail?.toLowerCase() === context.user.email.toLowerCase());

    // One digest email per maintainer, so nobody gets N identical mails.
    const perPerson = new Map<string, { member: CrewMembersRecordType; tickets: typeof pending }>();
    for (const ticket of pending) {
      const targets = notifyTargets(ids(ticket.assignedMaintainers), all);
      for (const m of targets) {
        if (!m.schoolEmail) continue;
        const g = perPerson.get(m.id);
        if (g) g.tickets.push(ticket); else perPerson.set(m.id, { member: m, tickets: [ticket] });
      }
    }

    const adminId = invoker?.id ?? '';
    let emailed = 0;
    for (const { member, tickets: theirs } of perPerson.values()) {
      const subject = `[Support] ${theirs.length === 1 ? 'A ticket is waiting on you' : `${theirs.length} tickets are waiting on you`}`;
      const lines = theirs.map((t, i) => {
        const when = t.submittedAt ? new Date(t.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        const preview = (t.message ?? '').split('\n')[0].slice(0, 200);
        return `**${i + 1}. ${t.subject ?? 'Untitled'}** (${t.type ?? 'support'}${when ? `, raised ${when}` : ''})\n\n> ${preview}\n\n`;
      }).join('');
      const body =
        `A few support tickets are sitting where only a maintainer can move them:\n\n` +
        `${lines}\n` +
        `Open each one to reply. Assigning yourself to a ticket stops the hourly reminders for it.\n\n---\n\n` +
        `${noReplyNotice('the AshTec crew', '')}\n\n${automatedFooter()}`;
      const buttons = theirs.map((t) => ({ type: 'button' as const, label: `Open: ${(t.subject ?? '').slice(0, 40)}`, href: ticketUrl(t.id) }));
      try {
        await Email.send({ to: member.schoolEmail!, subject, body: [{ type: 'text', content: body }, ...buttons] });
        emailed++;
        await zite.emailLog.create({
          record: { subject, member: member.id, recipientEmail: member.schoolEmail, purpose: 'Support Reminder', body, sentBy: 'AshTec Support', sentAt: new Date().toISOString(), batchId: pending.length > 1 ? 'reminder' : '' } as never,
        });
      } catch { /* an email is a reminder, not a reason to fail the whole call */ }
    }

    // A visible audit line on each ticket, plus arm the hourly escalation clock
    // so the automatic reminders wait a full interval before chiming again.
    if (emailed) {
      const who = adminId ? fullName(all.find((m) => m.id === adminId) ?? { firstName: '', lastName: '' }) || 'A maintainer' : 'A maintainer';
      const now = new Date().toISOString();
      for (const ticket of pending) {
        await zite.supportTickets.update({ id: ticket.id, record: { escalatedAt: now } as never });
        await zite.supportReplies.create({
          record: { ticket: ticket.id, author: adminId || undefined, kind: REPLY_KIND.note, body: `${who} reminded the maintainers - still waiting on a reply.`, recipients: '', sentAt: now } as never,
        });
      }
    }

    void notifySupportReminder([...perPerson.keys()], { count: pending.length, url: '/admin/support' });
    return { reminded: pending.length, emailed };
  },
});