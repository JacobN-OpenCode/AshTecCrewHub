import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids, mapShow, mapSubEvent, mapMember, isStaff, todayIso } from '../lib/server';
import { pendingForms } from '../lib/reminders';

/**
 * The full picture behind a Crew member, for the profile overview dialog.
 *
 * Sections map to what an admin actually asks about a person:
 *  - what they owe (forms with due dates),
 *  - upcoming shows and events and the member's answer to each,
 *  - what they have already attended (past events + past shows),
 *  - their venue check-in history (the timeline is per decision),
 *  - what the system has emailed them and what tickets they have raised.
 *
 * Staff deliberately get no show/attendance/forms sections: they do not respond
 * to event forms or take part in attendance, so those lists would only be noise.
 * They keep their check-in history, emails and tickets.
 */

export default createEndpoint({
  description: 'Returns everything about one crew member for the profile overview (admins)',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const member = await zite.crewMembers.findOne({ id: input.memberId });
    if (!member) throw new Error('Member not found.');

    const staff = isStaff(member);
    const today = todayIso();

    const [shows, subs, resps, att, presence, events, sessions, members, emails, tickets] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ filters: { member: member.id }, limit: 500 }),
      zite.attendance.findAll({ filters: { member: member.id }, limit: 2000 }),
      zite.venuePresence.findAll({ filters: { member: member.id }, limit: 500 }),
      zite.venuePresenceEvents.findAll({ filters: { member: member.id }, limit: 2000 }),
      zite.presenceSessions.findAll({ limit: 500 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.emailLog.findAll({ filters: { member: member.id }, limit: 200 }),
      zite.supportTickets.findAll({ filters: { submittedBy: member.id }, limit: 200 }),
    ]);

    const memById = new Map(members.records.map((m) => [m.id, m]));
    const nameOf = (id?: string) => {
      const m = id ? memById.get(id) : undefined;
      return m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || '' : '';
    };
    const subById = new Map(subs.records.map((s) => [s.id, s]));
    const showById = new Map(shows.records.map((s) => [s.id, s]));
    const sessionById = new Map(sessions.records.map((s) => [s.id, s]));
    const sessionTitle = (sessionId?: string) => {
      const ses = sessionId ? sessionById.get(sessionId) : undefined;
      const sub = ses ? subById.get(ids(ses.subEvent)[0] ?? '') : undefined;
      return sub?.title ?? 'Venue session';
    };
    const sessionDate = (sessionId?: string): string | null => {
      const ses = sessionId ? sessionById.get(sessionId) : undefined;
      const sub = ses ? subById.get(ids(ses.subEvent)[0] ?? '') : undefined;
      return sub?.date ?? null;
    };

    const respMap = new Map(resps.records.map((r) => [ids(r.show)[0], r.response ?? null]));
    const attMap = new Map(att.records.map((a) => [ids(a.subEvent)[0], a]));

    const hiddenShowIds = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));
    const visibleSubs = subs.records.filter(
      (e) => !e.hidden && !(e.shows?.length && ids(e.shows).every((id) => hiddenShowIds.has(id)))
    );

    const showList = shows.records.map(mapShow);
    const subList = visibleSubs.map(mapSubEvent);
    const outstanding = pendingForms(member.id, {
      shows: showList,
      subEvents: subList,
      responses: resps.records.map((r) => ({ memberId: member.id, showId: ids(r.show)[0] ?? '', response: r.response ?? '' })),
      attendance: att.records.map((a) => ({ memberId: member.id, subEventId: ids(a.subEvent)[0] ?? '', status: a.status ?? '' })),
    }).length;

    if (staff) {
      return {
        member: mapMember(member),
        isStaff: true,
        outstanding: 0,
        shows: [],
        upcoming: [],
        pastEvents: [],
        checkIns: checkIns(),
        timeline: timeline(),
        emails: emailList(),
        tickets: ticketList(),
      };
    }

    // A show counts as past only when it has run: every one of its events has a
    // real date and is behind us. A show with no events yet stays "current".
    const eventDates = (showId: string) =>
      visibleSubs.filter((e) => ids(e.shows).includes(showId)).map((e) => e.date ?? null);
    const isPastShow = (showId: string) => {
      const dates = eventDates(showId);
      return dates.length > 0 && dates.every((d) => !!d && d < today);
    };

    const upcoming = visibleSubs
      .filter((e) => {
        const d = e.date ?? null;
        return !d || d >= today;
      })
      .map((e) => {
        const showIds = ids(e.shows);
        return {
          id: e.id,
          title: e.title ?? 'Untitled',
          type: e.type ?? 'Rehearsal',
          date: e.date ?? null,
          dateTbc: !!e.dateTbc,
          startTime: e.startTime ?? null,
          endTime: e.endTime ?? null,
          showIds,
          dueDate: e.responseDueDate ?? null,
          dueUnknown: !!e.dueDateUnknown,
          status: attMap.get(e.id)?.status ?? null,
          reason: attMap.get(e.id)?.reason ?? '',
          shows: showIds.map((sid) => ({
            id: sid,
            name: showById.get(sid)?.showName ?? 'Untitled show',
            response: respMap.get(sid) ?? null,
          })),
        };
      })
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

    const pastEvents = visibleSubs
      .filter((e) => !!e.date && e.date < today)
      .map((e) => ({
        id: e.id,
        title: e.title ?? 'Untitled',
        type: e.type ?? 'Rehearsal',
        date: e.date,
        status: attMap.get(e.id)?.status ?? null,
        reason: attMap.get(e.id)?.reason ?? '',
      }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

    return {
      member: mapMember(member),
      isStaff: false,
      outstanding,
      shows: shows.records.map((s) => ({
        id: s.id,
        name: s.showName ?? 'Untitled show',
        code: s.shortCode ?? '',
        dueDate: s.responseDueDate ?? null,
        dueUnknown: !!s.dueDateUnknown,
        response: respMap.get(s.id) ?? null,
        isPast: isPastShow(s.id),
      })),
      upcoming,
      pastEvents,
      checkIns: checkIns(),
      timeline: timeline(),
      emails: emailList(),
      tickets: ticketList(),
    };

    // --- shared helpers (declared after the early staff return, still in scope) ---
    function checkIns() {
      return presence.records
        .map((p) => {
          const sessionId = ids(p.session)[0];
          return {
            sessionTitle: sessionTitle(sessionId),
            date: sessionDate(sessionId),
            state: p.state ?? null,
            signedInAt: p.signedInAt ?? null,
            signedOutAt: p.signedOutAt ?? null,
            reasonLabel: p.reasonLabel ?? '',
            reason: p.reason ?? '',
            lastAt: p.signedOutAt ?? p.signedInAt ?? p.updatedAt ?? null,
          };
        })
        .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    }

    function timeline() {
      return events.records
        .map((e) => ({
          action: e.action ?? '',
          at: e.at ?? null,
          sessionTitle: sessionTitle(ids(e.session)[0]),
          byName: nameOf(ids(e.by)[0]),
          reasonLabel: e.reasonLabel ?? '',
        }))
        .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
        .slice(0, 50);
    }

    function emailList() {
      return emails.records
        .map((e) => ({
          subject: e.subject ?? '',
          purpose: e.purpose ?? '',
          sentAt: e.sentAt ?? e.createdAt ?? null,
        }))
        .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))
        .slice(0, 20);
    }

    function ticketList() {
      return tickets.records
        .map((t) => ({
          subject: t.subject ?? '',
          status: t.status ?? '',
          submittedAt: t.submittedAt ?? t.createdAt ?? null,
        }))
        .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
        .slice(0, 20);
    }
  },
});