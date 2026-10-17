import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember, ids } from '../lib/server';
import { computeStats, hoursForEvent, todayIso, type StatEvent, type StatAttendance } from '../lib/crewStats';
import { BADGES, earnedBadges } from '../lib/badges';

/**
 * The crew leaderboard. Hours and events come from attendance over countable
 * (past, visible, timed) events; badges are derived from the same stats plus a
 * few profile facts. Members only: this is a whole-crew view.
 */
export default createEndpoint({
  description: 'Crew hours leaderboard plus earned badges (members-only)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);

    const [members, subs, att] = await Promise.all([
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.attendance.findAll({ limit: 20000 }),
    ]);
    // Ticket 3ead37f8: badges can also be granted by hand (work from before the
    // app existed). They are additive - unioned with the computed ones so a
    // manual grant shows on the board, the profile and My Badges alike.
    const { records: manualRows } = await zite.memberBadges.findAll({ limit: 20000 });
    const manualByMember = new Map<string, string[]>();
    for (const r of manualRows) {
      const mid = ids(r.member)[0];
      if (!mid || !r.badgeId) continue;
      const list = manualByMember.get(mid);
      if (list) list.push(r.badgeId); else manualByMember.set(mid, [r.badgeId]);
    }

    const memberRecords = members.records.filter((m) => !m.isPreviewAccount);
    const events: StatEvent[] = subs.records.map((e) => ({
      id: e.id,
      date: e.date ?? null,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      type: e.type ?? 'Rehearsal',
      hidden: !!e.hidden,
    }));
    const showsBySubEvent = new Map<string, string[]>(
      subs.records.map((e) => [e.id, ids(e.shows)]),
    );
    const attendance: StatAttendance[] = att.records.map((a) => ({
      member: ids(a.member)[0] ?? null,
      subEvent: ids(a.subEvent)[0] ?? null,
      status: a.status ?? '',
    }));

    const stats = computeStats(events, attendance, { showsBySubEvent });

    // How many events can contribute at all, so the page can explain an empty
    // board honestly instead of looking broken.
    const timed = events.filter((e) => !e.hidden && !!e.date && hoursForEvent(e) > 0);
    const today = todayIso();
    const pastEvents = timed.filter((e) => e.date! <= today).length;
    const upcomingEvents = timed.length - pastEvents;

    const rows = memberRecords
      .map((m) => {
        const mm = mapMember(m);
        const stat = stats.get(m.id) ?? { hours: 0, events: 0, byType: {}, showIds: [] };
        const badges = earnedBadges({
          stat,
          roles: mm.roles,
          headOf: mm.headOf,
          memberType: mm.memberType,
          isMentor: mm.isMentor,
          hasAvatar: !!mm.avatarUrl,
          hasStatus: !!mm.statusText || !!mm.statusEmoji,
          hasBirthday: !!mm.birthday,
          isAdmin: mm.isAdmin,
        }).map((b) => b.id);
        // Dedupe against the manual grants so a badge is never listed twice.
        const merged = [...new Set([...badges, ...(manualByMember.get(m.id) ?? [])])];
        return {
          id: m.id,
          firstName: mm.firstName,
          lastName: mm.lastName,
          year: mm.year,
          memberType: mm.memberType,
          isStaff: mm.isStaff,
          avatarUrl: mm.avatarUrl,
          hours: stat.hours,
          events: stat.events,
          badgeIds: merged,
        };
      })
      .sort((a, b) => b.hours - a.hours || b.events - a.events || (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName))
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const current = rows.find((r) => r.id === me.id) ?? null;

    return {
      rows,
      me: current,
      pastEvents,
      upcomingEvents,
      badges: BADGES.map((b) => ({ id: b.id, label: b.label, emoji: b.emoji, description: b.description, tier: b.tier })),
    };
  },
});
