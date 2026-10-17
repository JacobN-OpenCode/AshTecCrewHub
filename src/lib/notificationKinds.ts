/**
 * The personal push kinds a member can turn on or off (Batch 6: push tuning).
 *
 * Shared between server and client so the Settings UI and the senders cannot
 * drift: the `id` here is the same string the senders pass to `allowsKind` and
 * the same key stored in the member's `notificationPrefs` blob.
 *
 * Admin/operational pushes (tickets, venue approval, server errors) are NOT
 * listed here on purpose: they carry a duty, and the existing admin-notifications
 * switch already governs them.
 */

export interface NotificationKind {
  id: string;
  label: string;
  hint: string;
}

export const NOTIFICATION_KINDS: NotificationKind[] = [
  { id: 'form-due', label: 'Form due', hint: 'A show or event response is still waiting for you.' },
  { id: 'checkin-prompt', label: 'Check-in prompts', hint: 'You are on site and have not signed in yet.' },
  { id: 'overdue-return', label: 'Overdue return', hint: 'You said you would be back and have not returned.' },
  { id: 'event-updated', label: 'Event changes', hint: 'A date, time or place changed on something you are in.' },
  { id: 'cue-call', label: 'Cue calls', hint: 'Someone is calling you to the stage.' },
  { id: 'cover-request', label: 'Cover requests', hint: 'Someone cannot make it and is asking for cover.' },
  { id: 'announcement', label: 'Crew announcements', hint: 'A new notice posted for the whole crew.' },
  { id: 'dm', label: 'Direct messages', hint: 'Someone has sent you a message.' },
];

export const NOTIFICATION_KIND_IDS = NOTIFICATION_KINDS.map((k) => k.id);

/** A member's stored choices: true = send, false = mute, absent = send (default on). */
export type NotificationPrefs = Record<string, boolean>;

/**
 * Missing prefs mean "on" everywhere, so a new kind needs no backfill and a
 * corrupt or empty blob can never silence someone. Shared by the server gate
 * and the Settings UI so both read the same rule.
 */
export function isKindEnabled(prefs: NotificationPrefs | null | undefined, kind: string): boolean {
  if (!prefs) return true;
  return prefs[kind] !== false;
}

/**
 * Parse the stored blob. Returns null for empty or unparseable input, which
 * `isKindEnabled` treats as "everything on" - a corrupt blob must never
 * silently silence someone. Returns null rather than throwing so callers on the
 * send path stay total.
 */
export function parseNotificationPrefs(raw?: string | null): NotificationPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as NotificationPrefs) : null;
  } catch {
    return null;
  }
}

/** Every known kind resolved to a boolean, for the Settings UI and getMe. */
export function resolvedNotificationPrefs(raw?: string | null): NotificationPrefs {
  const prefs = parseNotificationPrefs(raw);
  return Object.fromEntries(NOTIFICATION_KIND_IDS.map((id) => [id, isKindEnabled(prefs, id)]));
}
