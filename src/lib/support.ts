import type { CrewMembersRecordType } from 'zitejs/db';
import { isEmailable, isStaff } from './server';

export const REPLY_KIND = { toUser: 'To User', note: 'Internal Note', fromUser: 'From User' } as const;
export const ESCALATION_HOURS = 12;

/**
 * Who to notify about a ticket: the assignees if there are any, else every
 * maintainer, else admins who aren't staff so an escalation never goes nowhere.
 */
export function notifyTargets(assignedIds: string[], members: CrewMembersRecordType[]) {
  const assigned = assignedIds.filter(Boolean);
  const pool = assigned.length ? members.filter((m) => assigned.includes(m.id)) : members.filter((m) => m.isMaintainer);
  const targets = pool.filter((m) => isEmailable(m));
  if (targets.length) return targets;
  return members.filter((m) => m.isAdmin && !isStaff(m) && isEmailable(m));
}

const ts = (v: string | null | undefined) => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Due when no maintainer has acted for a full interval, and then again every
 * interval after that until somebody replies. `lastReplyAt` is the clock the
 * escalation hangs off, so replying to a ticket re-arms a full interval rather
 * than tripping it instantly.
 */
export function isDueForEscalation(t: { submittedAt?: string | null; lastReplyAt?: string | null; escalatedAt?: string | null }) {
  // ts() returns 0 for a missing or unparseable date. Treating that as a real
  // timestamp would make quietFor ~56 years and fire an escalation on every
  // single run for a ticket that simply has no clock yet.
  const anchor = Math.max(ts(t.lastReplyAt), ts(t.submittedAt));
  if (anchor === 0) return false;
  const quietFor = Date.now() - anchor;
  if (quietFor < ESCALATION_HOURS * 3600_000) return false;
  const sinceEscalation = Date.now() - ts(t.escalatedAt);
  return sinceEscalation >= ESCALATION_HOURS * 3600_000;
}

export const ticketUrl = (id: string) => `${process.env.ZITE_APP_URL}/admin/support/${id}`;

export const fullName = (m: { firstName?: string | null; lastName?: string | null }) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
