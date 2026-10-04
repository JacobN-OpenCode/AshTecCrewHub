export const PLATFORM = 'AshTec Crew Hub';
export const SCHOOL = 'Ashford School Tech Crew';

/** Ticket d6b098db: the club's WhatsApp community, offered on the profile page. */
export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/JhA4KCg171A0iabtZEshFv';

export const ROLES = ['Stage Left', 'Stage Right', 'Microphone Management', 'Lighting', 'Sound'];
export const YEARS = ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13', 'Staff'];

/** Years a member may set for themselves. Staff is admin-managed so nobody self-promotes. */
export const SELF_YEARS = YEARS.filter((y) => y !== 'Staff');
export const MEMBER_TYPES = ['Normal Member', 'Expert', 'Teacher', 'Actor'];
export const SUBTYPES: Record<string, string[]> = {
  Rehearsal: ['Weekend Rehearsal', 'All Day Rehearsal', 'Part Day Rehearsal'],
  Performance: ['Normal Performance', 'Matinee Performance'],
  // Ticket 43e07671. Club sessions are the regular club meetings, not part of a
  // production, so they carry no show and get their own category everywhere.
  'Club Session': ['Weekly Session', 'Workshop', 'Social', 'Trip'],
};

/** Club sessions are the only event type that does not belong to a show. */
export const CLUB_SESSION = 'Club Session';
export const isClubSession = (type?: string) => type === CLUB_SESSION;

/** The event types an admin can choose, in the order they appear in pickers. */
export const EVENT_TYPES = ['Rehearsal', 'Performance', CLUB_SESSION] as const;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const isPastDue = (due: string | null, unknown: boolean) => !unknown && !!due && due < todayIso();

export function fmtDate(d: string | null, tbc = false) {
  if (tbc || !d) return 'Date TBC';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function dueLabel(d: string | null, unknown: boolean) {
  if (unknown || !d) return 'Deadline: to be confirmed';
  return `${isPastDue(d, unknown) ? 'Closed' : 'Respond by'} ${fmtDate(d)}`;
}

export const STATUS_STYLE: Record<string, string> = {
  'Expected Arrival': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Maybe: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not Attending': 'bg-red-500/15 text-red-400 border-red-500/30',
  'Not Attending Event': 'bg-muted text-muted-foreground border-border',
};

export const IMPORTANCE_STYLE: Record<string, string> = {
  High: 'bg-red-500/15 text-red-400 border-red-500/30',
  Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  Low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

/**
 * Why someone is leaving the venue, for venue check-in (not event RSVP, which
 * uses the free-text reason in the Attendance dialog).
 *
 * A fixed list on purpose: "toilet" and "food" are the only two answers that
 * matter to a stage manager, and free text turns the roster into a wall of
 * sentences. "Other" is the escape hatch and does require a written reason.
 *
 * Lives here rather than in lib/presence.ts because that file imports the
 * database layer and is backend-only, while the picker that renders these
 * options is a React component.
 */
export const SIGN_OUT_REASONS = ['Toilet', 'Food', 'Phone call', 'Runs off stage', 'Ill', 'Other'];
export const CUSTOM_REASON = 'Other';
