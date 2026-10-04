import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids } from '../lib/server';
import { pendingForms, type RShow, type RSub, type RResp, type RAtt } from '../lib/reminders';
import { notifyFormDue, notifyCheckInPrompt, notifyOverdueReturn } from '../../server/notify';

/**
 * The hourly notification pass. Runs from the server scheduler, not from the
 * browser, so it fires whether or not anyone has the app open.
 *
 * It only ever creates notifications that have not been sent before: every send
 * goes through claimNotification, which is a unique insert, so a repeated tick is
 * harmless. That is what makes "run it every hour" safe.
 */

/** How long before a deadline to warn. A day's notice is enough to act on. */
const WARN_HOURS = 36;

export default createEndpoint({
  description: 'Scheduled: sends due-date, check-in and overdue-return notifications (server only)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  // Hourly, alongside the support escalation. Admins can also run it by hand to
  // test; the unique-dedupe insert makes a manual run safe.
  schedule: {
    scheduleType: 'recurring',
    schedule: { frequency: 'hourly', interval: 1 },
    timezone: 'Europe/London',
  },
  execute: async ({ context }) => {
    if (context.user) await requireAdmin(context.user.email);
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    const [shows, subs, resps, att, members, sessions, presence] = await Promise.all([
      zite.shows.findAll({ limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ limit: 5000 }),
      zite.attendance.findAll({ limit: 5000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.presenceSessions.findAll({ limit: 50 }),
      zite.venuePresence.findAll({ limit: 5000 }),
    ]);

    const formData = {
      shows: shows.records.map((s) => ({
        id: s.id, name: s.showName ?? '', dueDate: s.responseDueDate ?? null,
        dueUnknown: !!s.dueDateUnknown, hidden: !!s.hidden,
      })) as RShow[],
      subEvents: subs.records.map((e) => ({
        id: e.id, title: e.title ?? '', showIds: ids(e.shows), dueDate: e.responseDueDate ?? null,
        dueUnknown: !!e.dueDateUnknown, date: e.date ?? null, dateTbc: !!e.dateTbc, hidden: !!e.hidden,
      })) as RSub[],
      responses: resps.records.map((r) => ({
        memberId: ids(r.member)[0] ?? '', showId: ids(r.show)[0] ?? '', response: r.response ?? '',
      })) as RResp[],
      attendance: att.records.map((a) => ({
        memberId: ids(a.member)[0] ?? '', subEventId: ids(a.subEvent)[0] ?? '', status: a.status ?? '',
      })) as RAtt[],
    };

    let forms = 0;
    let checkins = 0;
    let overdue = 0;

    // 1. Forms due soon, per member.
    for (const m of members.records) {
      if (m.isPreviewAccount) continue;
      for (const form of pendingForms(m.id, formData)) {
        const due = Date.parse(`${form.dueDate}T23:59:59Z`);
        if (Number.isNaN(due)) continue;
        const hoursLeft = (due - now) / 3_600_000;
        // Warn once inside the window and not after it has already passed by more
        // than a day, so old deadlines do not produce noise.
        if (hoursLeft > WARN_HOURS || hoursLeft < -24) continue;
        await notifyFormDue(m.id, { kind: form.kind, title: form.title, dueDate: form.dueDate });
        forms++;
      }
    }

    // 2. An open check-in session: nudge anyone on the roster of that event who
    //    has not signed in.
    const open = sessions.records.filter((s) => s.status === 'Active');
    for (const session of open) {
      const subId = ids(session.subEvent)[0];
      const sub = subs.records.find((s) => s.id === subId);
      const title = sub?.title ?? 'Venue check-in';
      const roster = new Set(
        presence.records.filter((p) => ids(p.session)[0] === session.id).map((p) => ids(p.member)[0] ?? '')
      );
      // Everyone who said yes/maybe to a show this event belongs to, who is not
      // already on the roster.
      const showIds = ids(sub?.shows as never);
      const expected = new Set<string>();
      for (const r of resps.records) {
        if (!['Yes', 'Maybe'].includes(r.response ?? '')) continue;
        if (showIds.includes(ids(r.show)[0] ?? '')) expected.add(ids(r.member)[0] ?? '');
      }
      for (const id of expected) {
        if (!id || roster.has(id)) continue;
        const m = members.records.find((x) => x.id === id);
        if (!m || m.isPreviewAccount) continue;
        await notifyCheckInPrompt(id, session.id, title);
        checkins++;
      }
    }

    // 3. Overdue returns: state "Expected Back" whose time has passed.
    for (const p of presence.records) {
      if (p.state !== 'Expected Back' || !p.expectedBackAt) continue;
      if (Date.parse(p.expectedBackAt) > now) continue;
      const memberId = ids(p.member)[0];
      if (!memberId) continue;
      const m = members.records.find((x) => x.id === memberId);
      const name = m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'A crew member' : 'A crew member';
      await notifyOverdueReturn(memberId, name, p.expectedBackAt);
      overdue++;
    }

    return { date: today, forms, checkins, overdue };
  },
});
