/**
 * Badge definitions. Each badge is earned by a pure predicate over a member's
 * stats and profile, so badges are always consistent with the data and there is
 * no award job to drift out of sync. Add a badge by adding one entry here; the
 * leaderboard and profile pick it up automatically.
 */

import type { MemberStat } from './crewStats';

export type BadgeInput = {
  stat: MemberStat;
  /** The member's assigned crew roles. */
  roles: string[];
  headOf: string[];
  memberType: string;
  isMentor: boolean;
  hasAvatar: boolean;
  hasStatus: boolean;
  hasBirthday: boolean;
  isAdmin: boolean;
};

export type BadgeDef = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Lower is "easier"/commoner, so sorting tiers do not interleave. */
  tier: number;
  earned: (i: BadgeInput) => boolean;
};

const TECH_ROLES = ['Lighting', 'Sound', 'Follow Spot', 'Microphone Management'];
const STAGE_ROLES = ['Stage Left', 'Stage Right'];

export const BADGES: BadgeDef[] = [
  { id: 'first-event', label: 'First Call', emoji: '🎬', tier: 1, description: 'Attended your first crew event.', earned: (i) => i.stat.events >= 1 },
  { id: 'regular', label: 'Regular', emoji: '🔁', tier: 2, description: 'Attended 10 crew events.', earned: (i) => i.stat.events >= 10 },
  { id: 'dedicated', label: 'Dedicated', emoji: '💪', tier: 3, description: 'Attended 25 crew events.', earned: (i) => i.stat.events >= 25 },
  { id: 'veteran', label: 'Veteran', emoji: '🏅', tier: 4, description: 'Attended 50 crew events.', earned: (i) => i.stat.events >= 50 },
  { id: 'ten-hours', label: 'Ten Hours', emoji: '⏱️', tier: 2, description: 'Contributed 10 hours.', earned: (i) => i.stat.hours >= 10 },
  { id: 'fifty-hours', label: 'Fifty Hours', emoji: '⏳', tier: 3, description: 'Contributed 50 hours.', earned: (i) => i.stat.hours >= 50 },
  { id: 'hundred-hours', label: 'Century', emoji: '💯', tier: 4, description: 'Contributed 100 hours.', earned: (i) => i.stat.hours >= 100 },
  { id: 'tech-crew', label: 'Tech Crew', emoji: '🎚️', tier: 1, description: 'Hold a technical crew role.', earned: (i) => i.roles.some((r) => TECH_ROLES.includes(r)) },
  { id: 'stage-crew', label: 'Stage Crew', emoji: '🎭', tier: 1, description: 'Hold a stage role.', earned: (i) => i.roles.some((r) => STAGE_ROLES.includes(r)) },
  { id: 'performer', label: 'Performer', emoji: '🌟', tier: 1, description: 'On the crew as a performer.', earned: (i) => i.memberType === 'Actor' },
  { id: 'head-of', label: 'Head of Department', emoji: '🧭', tier: 3, description: 'Lead a department.', earned: (i) => i.headOf.length > 0 },
  { id: 'mentor', label: 'Mentor', emoji: '🫱', tier: 3, description: 'Signed up to mentor another member.', earned: (i) => i.isMentor },
  { id: 'showtime', label: 'Showtime', emoji: '🎟️', tier: 2, description: 'Crewed a performance (not just rehearsals).', earned: (i) => (i.stat.byType['Performance'] ?? 0) >= 1 },
  { id: 'multi-show', label: 'Multi-Show', emoji: '🎪', tier: 3, description: 'Crewed three or more different shows.', earned: (i) => i.stat.showIds.length >= 3 },
  { id: 'all-rounder', label: 'All-Rounder', emoji: '🧰', tier: 3, description: 'Attended three different kinds of event.', earned: (i) => Object.keys(i.stat.byType).length >= 3 },
  { id: 'well-known', label: 'Well Known', emoji: '📸', tier: 1, description: 'Uploaded a profile picture.', earned: (i) => i.hasAvatar },
  { id: 'status-set', label: 'Say Something', emoji: '💬', tier: 1, description: 'Set a custom status.', earned: (i) => i.hasStatus },
  { id: 'birthday', label: 'Birthday Added', emoji: '🎂', tier: 1, description: 'Shared your birthday with the crew.', earned: (i) => i.hasBirthday },
  { id: 'admin', label: 'Crew Admin', emoji: '🛡️', tier: 4, description: 'Helps run the crew as an admin.', earned: (i) => i.isAdmin },
];

export function earnedBadges(input: BadgeInput): BadgeDef[] {
  return BADGES.filter((b) => b.earned(input));
}

export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}
