/**
 * Ticket 1bbe2d65: remembering which theme you picked.
 *
 * Same reasoning as uiPrefs: this is about the screen you are sitting at, not
 * about your account, so it lives in localStorage and never touches the database.
 * A saved theme is just the variables the picker set, so it keeps working if the
 * built-in themes change later.
 */
import { useEffect, useState } from 'react';
import { THEMES, themeVars } from './themes';

const CHOICE_KEY = 'ashtec-theme';
const SAVED_KEY = 'ashtec-themes';
const EVENT = 'ashtec-theme';

export type Choice = { theme: string; palette: string };
export type SavedTheme = { id: string; name: string; vars: Record<string, string> };

export const MAX_SAVED = 5;

/** The original look, which the accent preference on My settings already owns. */
const DEFAULT_CHOICE: Choice = { theme: 'ashtec', palette: 'amber' };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

export const CUSTOM = 'custom';

export function getChoice(): Choice {
  const c = read<Choice | null>(CHOICE_KEY, null);
  if (!c || typeof c.theme !== 'string' || typeof c.palette !== 'string') return DEFAULT_CHOICE;
  // A saved look carries its own variables, so `custom` is a valid theme id.
  if (c.theme !== CUSTOM && !THEMES.some((t) => t.id === c.theme)) return DEFAULT_CHOICE;
  return c;
}

export function getSavedThemes(): SavedTheme[] {
  const list = read<SavedTheme[]>(SAVED_KEY, []);
  return Array.isArray(list) ? list.filter((t) => t && typeof t.id === 'string' && t.vars) : [];
}

/** Wipe every variable a theme may have set, so the stylesheet is in charge again. */
function clearVars() {
  const root = document.documentElement.style;
  for (const [key] of Object.entries(themeVars('ashtec', 'amber'))) root.removeProperty(key);
}

/** Inline styles beat the `:root`/`.dark` rules, so one pass restyles the app. */
export function applyVars(vars: Record<string, string>) {
  clearVars();
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
}

export function applyChoice(choice: Choice = getChoice()) {
  if (choice.theme === CUSTOM) {
    const found = getSavedThemes().find((t) => t.id === choice.palette);
    if (found) applyVars(found.vars);
    else clearVars();
    return;
  }
  // Picking the original with its amber palette means "no opinion": leave the
  // accent preference from My settings alone instead of freezing it here.
  if (choice.theme === DEFAULT_CHOICE.theme && choice.palette === DEFAULT_CHOICE.palette) {
    clearVars();
    return;
  }
  applyVars(themeVars(choice.theme, choice.palette));
}

export function saveTheme(name: string, vars: Record<string, string>): SavedTheme[] {
  const clean = name.trim().slice(0, 40);
  const list = getSavedThemes().filter((t) => t.name.toLowerCase() !== clean.toLowerCase());
  list.unshift({ id: `saved-${Date.now().toString(36)}`, name: clean, vars });
  const capped = list.slice(0, MAX_SAVED);
  write(SAVED_KEY, capped);
  window.dispatchEvent(new Event(EVENT));
  return capped;
}

export function deleteSavedTheme(id: string): SavedTheme[] {
  const list = getSavedThemes().filter((t) => t.id !== id);
  write(SAVED_KEY, list);
  window.dispatchEvent(new Event(EVENT));
  return list;
}

/**
 * The theme picker's state. One event for this tab, `storage` for the others:
 * change the theme on a phone and the tablet behind you follows.
 */
export function useTheme() {
  const [choice, setChoice] = useState<Choice>(() => getChoice());
  const [saved, setSaved] = useState<SavedTheme[]>(() => getSavedThemes());

  useEffect(() => {
    const sync = () => {
      setChoice(getChoice());
      setSaved(getSavedThemes());
      applyChoice();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const choose = (next: Choice) => {
    write(CHOICE_KEY, next);
    applyChoice(next);
    setChoice(next);
    window.dispatchEvent(new Event(EVENT));
  };

  /** Switch to a look you saved earlier, exactly as it was saved. */
  const applySaved = (id: string) => {
    const found = getSavedThemes().find((t) => t.id === id);
    if (!found) return;
    choose({ theme: CUSTOM, palette: id });
  };

  return { choice, choose, saved, save: saveTheme, remove: deleteSavedTheme, applySaved };
}
