/**
 * Crew contribution stats, shared by the hours leaderboard and the badge
 * engine so the two can never disagree about what someone has done.
 *
 * Hours come from attendance: an event that has both a start and an end time,
 * is dated in the past, is not hidden, and where the member is marked
 * "Expected Arrival". We deliberately do not invent hours for events without
 * times, so the number always means something. Everything here is pure so it
 * can be unit-tested without a database.
 */

export type StatEvent = {
  id: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  type: string;
  hidden: boolean;
};

export type StatAttendance = {
  member: string | null;
  subEvent: string | null;
  status: string;
};

export type MemberStat = {
  hours: number;
  events: number;
  /** How many attended events of each SubEvent type. */
  byType: Record<string, number>;
  /** Distinct shows the member has attended at least one event for. */
  showIds: string[];
};

/** Parse "HH:MM" (24h) to minutes past midnight, or null when unparseable. */
export function minutesOf(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Duration of a timed event in hours, or 0 when it has no usable times. */
export function hoursForEvent(e: Pick<StatEvent, 'startTime' | 'endTime'>): number {
  const s = minutesOf(e.startTime);
  const f = minutesOf(e.endTime);
  if (s === null || f === null || f <= s) return 0;
  return (f - s) / 60;
}

/** True when an event should count toward hours: past and not hidden. */
export function isCountable(e: StatEvent, today = todayIso()): boolean {
  if (e.hidden) return false;
  if (!e.date) return false;
  return e.date <= today;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Fold attendance and events into one stat per member id. Only rows with a
 * member and a matching countable event contribute. Manual admin entries count
 * the same as self-declared ones; the register is the register.
 */
export function computeStats(
  events: StatEvent[],
  attendance: StatAttendance[],
  opts: { showsBySubEvent?: Map<string, string[]>; today?: string } = {},
): Map<string, MemberStat> {
  const today = opts.today ?? todayIso();
  const byId = new Map(events.map((e) => [e.id, e]));
  const stats = new Map<string, MemberStat>();

  const bump = (id: string): MemberStat => {
    let s = stats.get(id);
    if (!s) { s = { hours: 0, events: 0, byType: {}, showIds: [] }; stats.set(id, s); }
    return s;
  };

  for (const a of attendance) {
    if (!a.member || !a.subEvent) continue;
    if (a.status !== 'Expected Arrival') continue;
    const ev = byId.get(a.subEvent);
    if (!ev || !isCountable(ev, today)) continue;
    const s = bump(a.member);
    s.events += 1;
    s.hours += hoursForEvent(ev);
    s.byType[ev.type] = (s.byType[ev.type] ?? 0) + 1;
    for (const showId of opts.showsBySubEvent?.get(ev.id) ?? []) {
      if (!s.showIds.includes(showId)) s.showIds.push(showId);
    }
  }

  // Round to a sane precision: two decimals is plenty and stops 3.333333
  // seam-counting artifacts from leaking into the UI.
  for (const s of stats.values()) s.hours = Math.round(s.hours * 100) / 100;
  return stats;
}

export const EMPTY_STAT: MemberStat = { hours: 0, events: 0, byType: {}, showIds: [] };
