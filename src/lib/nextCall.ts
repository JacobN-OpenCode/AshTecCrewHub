/**
 * Small helpers shared by the show-day surfaces (Batch 6): the compact widget,
 * the watch companion and the call sheet all need to describe "when" the same
 * way ("Today", "Tomorrow", "in 2h 15m"). Kept here rather than duplicated.
 */

/** The date part of an event, as YYYY-MM-DD, matching the API's `date` field. */
export interface NextCall {
  id: string;
  title: string;
  type: string;
  date: string | null;
  meetTime: string;
  startTime: string | null;
  showName: string;
}

const DAY_MS = 86_400_000;

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today" / "Tomorrow" / "Mon 4 Nov" / "Date TBC". */
export function describeDay(date: string | null): string {
  if (!date) return 'Date TBC';
  const now = new Date();
  const diff = Math.round((atMidnight(new Date(date + 'T12:00:00')) - atMidnight(now)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The time an event starts for the member: the call time is what matters. */
export const callTime = (e: { startTime: string | null; meetTime: string }) => e.startTime || e.meetTime || '';

/**
 * A countdown to a specific date + "HH:MM". Returns null when the event has no
 * usable time (so the caller can show nothing rather than "-3h"). The string is
 * coarse on purpose: "in 2h 15m", "in 4 days".
 */
export function countdown(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const target = new Date(`${date}T${m[1].padStart(2, '0')}:${m[2]}:00`).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
