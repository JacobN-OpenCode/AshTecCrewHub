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
const MODE_KEY = 'ashtec-theme-mode';
const EVENT = 'ashtec-theme';

export type Choice = { theme: string; palette: string };
export type ThemeMode = 'light' | 'dark';
export type SavedTheme = { id: string; name: string; vars: Record<string, string> };

export const MAX_SAVED = 5;

/** The original look, which the accent preference on My settings already owns. */
const DEFAULT_CHOICE: Choice = { theme: 'ashtec', palette: 'amber' };
const DEFAULT_MODE: ThemeMode = 'dark';

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

/**
 * The layout half of a theme lives in index.css, keyed on this attribute: the
 * sidebar, the card language, the type and the band above the page. Colour is
 * the other half, and it stays in variables.
 */
function setThemeAttr(id: string) {
  document.documentElement.dataset.theme = id;
}

export function getThemeMode(): ThemeMode {
  const mode = read<string>(MODE_KEY, DEFAULT_MODE);
  return mode === 'light' || mode === 'dark' ? mode : DEFAULT_MODE;
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.dataset.mode = mode;
}

function varsForMode(vars: Record<string, string>, mode: ThemeMode, themeId: string) {
  if (mode === 'light') {
    if (themeId !== 'ashtec' && themeId !== CUSTOM) return vars;
    return {
      ...vars,
      '--background': '40 20% 98%',
      '--foreground': '230 20% 10%',
      '--card': '0 0% 100%',
      '--card-foreground': '230 20% 10%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '230 20% 10%',
      '--secondary': '40 12% 93%',
      '--secondary-foreground': '230 20% 10%',
      '--muted': '40 12% 93%',
      '--muted-foreground': '230 8% 42%',
      '--accent': '36 50% 94%',
      '--accent-foreground': '30 80% 25%',
      '--border': '40 10% 86%',
      '--input': '40 10% 86%',
      '--sidebar-background': '0 0% 98%',
      '--sidebar-foreground': '240 5.3% 26.1%',
      '--sidebar-accent': '240 4.8% 95.9%',
      '--sidebar-accent-foreground': '240 5.9% 10%',
    };
  }

  const dark: Record<string, string> = {
    '--background': '230 20% 8%',
    '--foreground': '40 20% 94%',
    '--card': '230 20% 11%',
    '--card-foreground': '40 20% 94%',
    '--popover': '230 20% 11%',
    '--popover-foreground': '40 20% 94%',
    '--secondary': '230 16% 16%',
    '--secondary-foreground': '40 20% 94%',
    '--muted': '230 16% 15%',
    '--muted-foreground': '230 8% 68%',
    '--accent': '230 16% 19%',
    '--accent-foreground': '40 20% 94%',
    '--border': '230 14% 23%',
    '--input': '230 14% 25%',
    '--sidebar-background': '240 6% 10%',
    '--sidebar-foreground': '240 5% 92%',
    '--sidebar-accent': '240 4% 18%',
    '--sidebar-accent-foreground': '240 5% 94%',
  };
  const darkPalettes: Record<string, Record<string, string>> = {
    periwinkle: {
      '--background': '232 30% 9%', '--foreground': '232 35% 94%', '--card': '232 28% 13%',
      '--border': '232 22% 24%', '--muted': '232 24% 17%', '--muted-foreground': '232 14% 70%',
    },
    quiet: {
      '--background': '145 12% 9%', '--foreground': '42 28% 92%', '--card': '145 10% 13%',
      '--border': '90 10% 25%', '--muted': '145 10% 18%', '--muted-foreground': '100 8% 70%',
    },
    intelly: {
      '--background': '35 12% 9%', '--foreground': '40 30% 93%', '--card': '35 12% 14%',
      '--border': '35 10% 25%', '--muted': '35 10% 18%', '--muted-foreground': '35 8% 70%',
    },
    school: {
      '--background': '280 14% 10%', '--foreground': '330 25% 94%', '--card': '280 12% 15%',
      '--border': '280 10% 27%', '--muted': '280 10% 19%', '--muted-foreground': '300 10% 72%',
    },
    cakeshop: {
      '--background': '25 12% 9%', '--foreground': '40 35% 92%', '--card': '25 10% 14%',
      '--border': '25 10% 26%', '--muted': '25 10% 19%', '--muted-foreground': '30 10% 70%',
    },
  };
  Object.assign(dark, darkPalettes[themeId] ?? {});
  for (const key of ['--tint-1', '--tint-2', '--tint-3', '--tint-4']) {
    if (vars[key]) dark[key] = vars[key].replace(/(\d+(?:\.\d+)?)%\s*$/, '20%');
  }
  return { ...vars, ...dark };
}

export function applyChoice(choice: Choice = getChoice()) {
  const mode = getThemeMode();
  applyThemeMode(mode);
  if (choice.theme === CUSTOM) {
    // A saved look is only variables, so it borrows the original shell.
    setThemeAttr(DEFAULT_CHOICE.theme);
    const found = getSavedThemes().find((t) => t.id === choice.palette);
    if (found) applyVars(varsForMode(found.vars, mode, choice.theme));
    else clearVars();
    return;
  }
  if (choice.theme === DEFAULT_CHOICE.theme && choice.palette === DEFAULT_CHOICE.palette) {
    // Nothing picked yet: the stylesheet is already the original.
    clearVars();
    setThemeAttr(DEFAULT_CHOICE.theme);
    return;
  }
  applyVars(varsForMode(themeVars(choice.theme, choice.palette), mode, choice.theme));
  setThemeAttr(choice.theme);
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
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());
  const [saved, setSaved] = useState<SavedTheme[]>(() => getSavedThemes());

  useEffect(() => {
    const sync = () => {
      setChoice(getChoice());
      setMode(getThemeMode());
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

  const toggleMode = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    write(MODE_KEY, next);
    setMode(next);
    applyChoice();
    window.dispatchEvent(new Event(EVENT));
  };

  /** Switch to a look you saved earlier, exactly as it was saved. */
  const applySaved = (id: string) => {
    const found = getSavedThemes().find((t) => t.id === id);
    if (!found) return;
    choose({ theme: CUSTOM, palette: id });
  };

  return { choice, choose, mode, toggleMode, saved, save: saveTheme, remove: deleteSavedTheme, applySaved };
}
