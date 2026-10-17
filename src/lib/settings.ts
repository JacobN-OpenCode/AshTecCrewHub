/**
 * App-wide settings and per-member privacy, shared by the client and the
 * endpoints. Pure functions only — the reading/writing of the Settings table
 * happens in the endpoints, so this file is safe to import in the browser.
 */

// ------------------------------------------------------------------ settings

/** The Settings table is a key/value store; these are the keys we use. */
export const SETTING_KEYS = {
  /** Admin-curated list of skills members pick from. */
  skillOptions: 'skillOptions',
  /** Whether normal members may edit their own skills at all. */
  skillsEditable: 'skillsEditable',
  /** The crew cat's name, so the ATCMS settings page can rename it. */
  catName: 'catName',
  /** Admin-created feedback forms, alongside the built-in ones. */
  feedbackForms: 'feedbackForms',
  /** Branding: the platform and school names shown across the app. */
  platformName: 'platformName',
  schoolName: 'schoolName',
  /** Feature switches: which parts of the app are on at all. */
  features: 'features',
  /** The option lists the pickers use (roles, years, types, subtypes). */
  lists: 'lists',
} as const;

/** The skills we offer out of the box, until an admin curates their own list. */
export const DEFAULT_SKILL_OPTIONS = [
  'Lighting',
  'Sound',
  'Microphones',
  'Stage crew',
  'Follow spot',
  'Rigging',
  'Set build',
  'Projection',
  'Costumes',
  'Props',
  'Stage management',
  'Lighting design',
  'Sound design',
];

export type AppSettings = {
  skillOptions: string[];
  skillsEditable: boolean;
  catName: string;
  feedbackForms: CustomFeedbackForm[];
  platformName: string;
  schoolName: string;
  features: Features;
  lists: CrewLists;
};

// ---------------------------------------------------------------- features

/** The switches that turn whole parts of the app on or off. */
export const FEATURE_KEYS = [
  'schedule', 'announcements', 'memories', 'mascot', 'tools', 'parents', 'liveShow', 'badges', 'checkIn',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  schedule: 'Schedule',
  announcements: 'Announcements',
  memories: 'Show memories',
  mascot: 'The cat page',
  tools: 'Tools',
  parents: 'For parents',
  liveShow: 'Live show',
  badges: 'Badges',
  checkIn: 'Check-in',
};

export type Features = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: Features = {
  schedule: true,
  announcements: true,
  memories: true,
  mascot: true,
  tools: true,
  parents: true,
  liveShow: true,
  badges: true,
  checkIn: true,
};

export function cleanFeatures(raw: unknown): Features {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const k of FEATURE_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  return out;
}

// ------------------------------------------------------------ option lists

/** The lists every picker in the app draws from. Admins curate these. */
export type CrewLists = {
  roles: string[];
  years: string[];
  memberTypes: string[];
};

const cleanList = (raw: unknown, fallback: string[], max = 40): string[] => {
  if (!Array.isArray(raw)) return fallback;
  const out = [...new Set(raw.map((s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))];
  return out.length ? out.slice(0, max) : fallback;
};

export function cleanLists(raw: unknown, fallback: CrewLists): CrewLists {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    roles: cleanList(o.roles, fallback.roles),
    years: cleanList(o.years, fallback.years),
    memberTypes: cleanList(o.memberTypes, fallback.memberTypes),
  };
}

/** The built-in lists, used as the defaults and the fallback. */
export const DEFAULT_LISTS: CrewLists = {
  roles: ['Stage Left', 'Stage Right', 'Microphone Management', 'Lighting', 'Sound', 'Follow Spot'],
  years: ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13', 'Staff'],
  memberTypes: ['Normal Member', 'Expert', 'Teacher', 'Actor', 'Contractor'],
};

export const DEFAULT_SETTINGS: AppSettings = {
  skillOptions: DEFAULT_SKILL_OPTIONS,
  skillsEditable: true,
  catName: 'Tabby',
  feedbackForms: [],
  platformName: 'AshTec Crew Hub',
  schoolName: 'Ashford School Tech Crew',
  features: DEFAULT_FEATURES,
  lists: DEFAULT_LISTS,
};

/**
 * A feedback form an admin created from the settings page. Always freeform: a
 * title, an intro and one or more paragraph prompts. The built-in forms live in
 * src/lib/feedback.ts; these are merged in beside them.
 */
export type CustomFeedbackForm = {
  id: string;
  title: string;
  intro: string;
  prompts: { id: string; label: string; hint?: string }[];
};

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Tidy admin-supplied custom forms: valid ids, a title, at least one prompt. */
export function cleanCustomForms(raw: unknown): CustomFeedbackForm[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: CustomFeedbackForm[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = slug(String(o.id ?? o.title ?? ''));
    const title = String(o.title ?? '').trim().slice(0, 120);
    if (!id || !title || seen.has(id)) continue;
    const prompts = (Array.isArray(o.prompts) ? o.prompts : [])
      .map((p, i) => {
        const po = (p ?? {}) as Record<string, unknown>;
        const label = String(po.label ?? '').trim().slice(0, 200);
        const pid = slug(String(po.id ?? label)) || `q${i + 1}`;
        const hint = String(po.hint ?? '').trim().slice(0, 300);
        return label ? { id: pid, label, ...(hint ? { hint } : {}) } : null;
      })
      .filter((p): p is { id: string; label: string; hint?: string } => !!p)
      .slice(0, 20);
    if (!prompts.length) continue;
    seen.add(id);
    out.push({ id, title, intro: String(o.intro ?? '').trim().slice(0, 2000), prompts });
  }
  return out.slice(0, 40);
}

/** Tidy an admin-supplied skill list: trim, drop blanks, de-dupe, cap. */
export const cleanSkillOptions = (raw: unknown): string[] =>
  [...new Set(
    (Array.isArray(raw) ? raw : [])
      .map((s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 40))
      .filter(Boolean),
  )].slice(0, 60);

/** Split a stored comma list into a tidy array. */
export const parseList = (raw: string | null | undefined): string[] =>
  (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Keep only the values that are still valid options (used on save). */
export const onlyKnownSkills = (values: string[], options: string[]): string[] => {
  const ok = new Set(options.map((o) => o.toLowerCase()));
  return values.filter((v) => ok.has(v.toLowerCase()));
};

// ------------------------------------------------------------------- privacy

export type PrivacyLevel = 'crew' | 'admins' | 'none';
export type PrivacyField = 'avatar' | 'email' | 'skills';

export type Privacy = {
  avatar: PrivacyLevel;
  email: PrivacyLevel;
  skills: PrivacyLevel;
  /** Member ids this member hides their details from (admins are ignored). */
  blocked: string[];
};

export const DEFAULT_PRIVACY: Privacy = { avatar: 'crew', email: 'crew', skills: 'crew', blocked: [] };

const LEVELS: PrivacyLevel[] = ['crew', 'admins', 'none'];
const asLevel = (v: unknown, fallback: PrivacyLevel): PrivacyLevel =>
  LEVELS.includes(v as PrivacyLevel) ? (v as PrivacyLevel) : fallback;

/** Read a stored jsonb blob (or a string of it) into a complete Privacy. */
export function parsePrivacy(raw: unknown): Privacy {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { obj = {}; }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  const blocked = Array.isArray(obj.blocked) ? (obj.blocked as unknown[]).map((x) => String(x)) : [];
  return {
    avatar: asLevel(obj.avatar, DEFAULT_PRIVACY.avatar),
    email: asLevel(obj.email, DEFAULT_PRIVACY.email),
    skills: asLevel(obj.skills, DEFAULT_PRIVACY.skills),
    blocked: [...new Set(blocked)].slice(0, 200),
  };
}

export const PRIVACY_LABEL: Record<PrivacyLevel, string> = {
  crew: 'Everyone in the crew',
  admins: 'Admins only',
  none: 'Only me',
};

/**
 * Whether `viewer` may see `field` on the member `targetId`.
 *
 * Admins are never restricted and a member always sees their own record, which
 * is exactly what "restrict people, EXCLUDING ADMINS" asks for.
 */
export function fieldVisible(
  privacy: Privacy,
  field: PrivacyField,
  viewer: { id: string; isAdmin: boolean },
  targetId: string,
): boolean {
  if (viewer.id === targetId) return true;
  if (viewer.isAdmin) return true;
  if (privacy.blocked.includes(viewer.id)) return false;
  return privacy[field] === 'crew';
}
