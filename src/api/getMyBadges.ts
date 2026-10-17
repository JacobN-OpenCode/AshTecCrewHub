import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember, ids } from '../lib/server';
import { computeStats, type StatEvent, type StatAttendance } from '../lib/crewStats';
import { BADGES, earnedBadges } from '../lib/badges';

/**
 * The caller's own badges, and the full badge catalogue to show alongside them.
 *
 * Feedback round 2: the crew hours leaderboard is gone, but badges stay. This
 * endpoint replaces the badge half of the old getLeaderboard, without the
 * ranking or anyone else's numbers.
 */
export default createEndpoint({
  description: 'The caller’s own badges plus the badge catalogue (members-only).',
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
    // Manual grants (ticket 3ead37f8) are additive to the computed badges.
    const { records: manualRows } = await zite.memberBadges.findAll({ limit: 20000 });
    const manual = manualRows
      .filter((r) => ids(r.member)[0] === me.id && r.badgeId)
      .map((r) => String(r.badgeId));

    const events: StatEvent[] = subs.records.map((e) => ({
      id: e.id,
      date: e.date ?? null,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      type: e.type ?? 'Rehearsal',
      hidden: !!e.hidden,
    }));
    const showsBySubEvent = new Map<string, string[]>(subs.records.map((e) => [e.id, ids(e.shows)]));
    const attendance: StatAttendance[] = att.records
      .filter((a) => ids(a.member)[0] === me.id)
      .map((a) => ({ member: me.id, subEvent: ids(a.subEvent)[0] ?? null, status: a.status ?? '' }));

    const stats = computeStats(events, attendance, { showsBySubEvent });
    const record = members.records.find((m) => m.id === me.id);
    const mm = record ? mapMember(record) : mapMember(me as never);
    const stat = stats.get(me.id) ?? { hours: 0, events: 0, byType: {}, showIds: [] };
    const earned = earnedBadges({
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

    return {
      mine: [...new Set([...earned, ...manual])],
      badges: BADGES.map((b) => ({ id: b.id, label: b.label, emoji: b.emoji, description: b.description, tier: b.tier })),
    };
  },
});
