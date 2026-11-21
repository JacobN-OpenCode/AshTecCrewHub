/**
 * Ticket 36b2cc84: "Ask AI to create a theme".
 *
 * The ideas worth keeping, split out of the page so the server, the MCP tools and
 * the tests all agree on them:
 *
 *   - a theme is a NAME plus a set of colours, nothing else;
 *   - it starts from one of the built-in looks, so it never arrives half-styled
 *     (the shell, spacing and type still come from that look);
 *   - every colour is an HSL triplet in the same "280 60% 55%" form the
 *     stylesheet already uses, which is also what makes a bad value easy to
 *     reject instead of silently painting something invisible;
 *   - themes belong to one person. An AI makes them through that person's MCP
 *     key, and only they see them on their Themes page.
 */
import { THEMES, themeVars } from './themes';

export type CustomTheme = {
  id: string;
  name: string;
  base: string;
  vars: Record<string, string>;
  createdAt?: string;
};

export const MAX_CUSTOM_THEMES = 10;
export const NAME_MAX = 40;

/** The same shape index.css and Tailwind's config expect: "h s% l%". */
const HSL = /^(\d{1,3}) (\d{1,3})% (\d{1,3})%$/;

export function isHslTriplet(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = HSL.exec(value.trim());
  if (!m) return false;
  return Number(m[1]) <= 360 && Number(m[2]) <= 100 && Number(m[3]) <= 100;
}

/** One line, no stray spaces, and never longer than the picker's box. */
export function cleanThemeName(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** An unknown or forgotten base falls back to the original look rather than nothing. */
export function cleanBase(raw: unknown): string {
  const id = String(raw ?? '').trim();
  return THEMES.some((t) => t.id === id) ? id : 'ashtec';
}

/** Drops anything that is not a colour this app can paint with. */
export function normaliseVars(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key.startsWith('--') || key.length > 40) continue;
    if (!isHslTriplet(value)) continue;
    out[key] = String(value).trim();
  }
  return out;
}

/**
 * The full set of variables the app needs, so a theme made from three colours
 * still has every other colour defined. Overrides can only touch keys the base
 * look already sets: inventing a variable would do nothing except confuse the
 * next person reading it.
 */
export function buildVars(base: unknown, palette: unknown, overrides: unknown): Record<string, string> {
  const theme = THEMES.find((t) => t.id === cleanBase(base)) ?? THEMES[0];
  const pal = theme.palettes.find((p) => p.id === String(palette ?? '')) ?? theme.palettes[0];
  const vars = themeVars(theme.id, pal.id);
  const out: Record<string, string> = { ...vars };
  for (const [key, value] of Object.entries(normaliseVars(overrides))) {
    if (key in vars) out[key] = value;
  }
  return out;
}

/** Why a theme cannot be saved, or null when it can. */
export function themeProblem(name: string, vars: Record<string, string>): string | null {
  if (!name) return 'Give the theme a name.';
  if (Object.keys(vars).length === 0) return 'A theme needs at least one colour.';
  return null;
}
