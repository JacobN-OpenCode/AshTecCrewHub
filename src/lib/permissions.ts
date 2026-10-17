/**
 * Permissions (feedback round 2).
 *
 * Normal members are read-only in the show workspaces. An admin can grant a
 * member extra permissions, or take away one they would normally have. Admins
 * always hold every permission, so an admin can never lock themselves out.
 *
 * The model is a small catalogue with a sensible default per permission, plus a
 * per-member { granted, revoked } override. Revoked beats granted beats default.
 */

export type PermissionKey =
  | 'show.edit'      // edit show workspaces: scenes, cues, props, checklist, notes, timings, media
  | 'show.run'       // run a show day: roll call, sign-off, cue calls, cover
  | 'announce.post'  // post crew announcements
  | 'members.view'   // open another member's profile card
  | 'profile.edit';  // edit your own profile

export type PermissionDefault = 'all' | 'admin';

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  blurb: string;
  /** Who holds it by default: every member, or admins only. */
  fallback: PermissionDefault;
};

export const PERMISSIONS: PermissionDef[] = [
  { key: 'show.edit', label: 'Edit show workspaces', blurb: 'Change scenes, cues, props, checklists, notes, timings and photos.', fallback: 'admin' },
  { key: 'show.run', label: 'Run a show day', blurb: 'Take roll call, sign off, send cue calls and ask for cover.', fallback: 'all' },
  { key: 'announce.post', label: 'Post announcements', blurb: 'Write crew-wide announcements.', fallback: 'admin' },
  { key: 'members.view', label: 'View member profiles', blurb: 'Open another member’s profile card.', fallback: 'all' },
  { key: 'profile.edit', label: 'Edit own profile', blurb: 'Change your own name, year, picture and skills.', fallback: 'all' },
];

export const PERMISSION_BY_KEY: Record<string, PermissionDef> =
  Object.fromEntries(PERMISSIONS.map((p) => [p.key, p]));

export type PermissionState = { granted: string[]; revoked: string[] };

export const EMPTY_PERMISSIONS: PermissionState = { granted: [], revoked: [] };

export function parsePermissionState(raw: unknown): PermissionState {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { obj = {}; }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter((k) => k in PERMISSION_BY_KEY) : []);
  return { granted: [...new Set(list(obj.granted))], revoked: [...new Set(list(obj.revoked))] };
}

/** Just the keys, for a member record. */
export type PermissionSubject = { isAdmin?: boolean; memberType?: string; permissions?: unknown };

/**
 * The set of permissions this member effectively holds.
 * Admins hold all of them. Otherwise: revoked → off, granted → on, else default.
 */
export function effectivePermissions(m: PermissionSubject): Set<PermissionKey> {
  const all = PERMISSIONS.map((p) => p.key);
  if (m.isAdmin) return new Set(all);
  const { granted, revoked } = parsePermissionState(m.permissions);
  const out = new Set<PermissionKey>();
  for (const p of PERMISSIONS) {
    if (revoked.includes(p.key)) continue;
    if (granted.includes(p.key) || p.fallback === 'all') out.add(p.key);
  }
  return out;
}

export const hasPermission = (m: PermissionSubject, key: PermissionKey): boolean =>
  effectivePermissions(m).has(key);
