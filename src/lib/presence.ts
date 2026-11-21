// Backend-only helpers for venue check-in (the "where is the crew right now" side
// of the app), shared by the presence endpoints in src/api/.
//
// This is deliberately separate from lib/server.ts, which deals with event RSVP
// intent. Attendance there answers "will you be at the rehearsal?"; presence
// here answers "are you in the room right now?". Mixing them means every
// presence read would drag RSVP state along with it, and the two disagree
// constantly: someone can be signed out of the venue while marked as attending.
import { zite } from '#db';
import { ids } from './server';

/** Where a member stands relative to the current session. */
export const PRESENCE_STATES = ['On Site', 'Off Site', 'Expected Back', 'Not at Venue'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * Reads a single-link field. The generated types declare every linked record as
 * `string | string[]` even when the column is single-link, so every one of these
 * has to be narrowed by hand. Doing it in one place keeps the cast out of the
 * endpoints.
 */
export const one = (v?: string | string[] | null) => (Array.isArray(v) ? v[0] : v) || undefined;

/** One row per member per session, so a second tap updates in place. */
export const presenceKey = (sessionId: string, memberId: string) => `${sessionId}:${memberId}`;

/**
 * Unguessable but short. A 36-character UUID pushes the approval QR up to a
 * denser symbol, which is measurably slower to read off a phone screen in a dim
 * venue; 20 hex characters is 80 bits of entropy, far more than enough for a
 * link that an admin approves once.
 */
export function newToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The one session that may be open at a time, or undefined. */
export async function activeSession() {
  const { records } = await zite.presenceSessions.findAll({
    filters: { status: 'Active' },
    limit: 10,
  });
  // Newest first: if a crash ever left two marked Active, treat the later one
  // as the real one rather than refusing to show the app at all.
  return records.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
}

export async function requireActiveSession() {
  const s = await activeSession();
  if (!s) throw new Error('There is no open check-in session right now.');
  return s;
}

export async function findPresence(sessionId: string, memberId: string) {
  return zite.venuePresence.findOne({ filters: { presenceKey: presenceKey(sessionId, memberId) } });
}

/** Strips the internal bookkeeping down to what the UI actually renders. */
export function mapPresence(p: {
  // Optional: this helper only reshapes presentation fields, and rows arrive
  // typed as a bare record index signature from the database layer.
  id?: string
  state?: string
  reasonLabel?: string
  reason?: string
  comingBack?: boolean
  expectedBackAt?: string | null
  signedInAt?: string | null
  signedOutAt?: string | null
  pendingAction?: string
  approvalToken?: string
}) {
  return {
    state: p.state ?? null,
    reasonLabel: p.reasonLabel ?? '',
    reason: p.reason ?? '',
    comingBack: !!p.comingBack,
    expectedBackAt: p.expectedBackAt ?? null,
    signedInAt: p.signedInAt ?? null,
    signedOutAt: p.signedOutAt ?? null,
    pendingAction: p.pendingAction ?? null,
    token: p.approvalToken ?? null,
  };
}

export async function findPresenceByToken(token: string) {
  return zite.venuePresence.findOne({ filters: { approvalToken: token } });
}

/**
 * Append one row to the venue check-in timeline (ticket 168e8274).
 *
 * The VenuePresence row is overwritten on every approval, so it can only show
 * the latest sign-in/out. This is the durable record the admin backlog reads:
 * who did what, when, and which admin approved it. Never updated or deleted.
 */
export async function logPresenceEvent(event: {
  session: string;
  member?: string | null;
  action: string;
  reasonLabel?: string;
  reason?: string;
  comingBack?: boolean;
  expectedBackAt?: string | null;
  at: string;
  by: string;
}): Promise<void> {
  await zite.venuePresenceEvents.create({
    record: {
      eventKey: `${event.session}:${event.at}:${event.action}:${event.member ?? 'session'}`,
      session: event.session,
      member: event.member ?? null,
      action: event.action,
      reasonLabel: event.reasonLabel ?? '',
      reason: event.reason ?? '',
      comingBack: !!event.comingBack,
      expectedBackAt: event.expectedBackAt ?? null,
      at: event.at,
      by: event.by,
    } as never,
  });
}

/** The member ids behind a set of presence rows, for name lookups. */
export const memberIdsOf = (rows: { member?: string | string[] | null }[]) =>
  [...new Set(rows.flatMap((r) => ids(r.member)))];