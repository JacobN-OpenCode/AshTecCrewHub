/**
 * Font choice.
 *
 * Tickets e3d9578f ("too curly, use something like Constantia") and 00bdfc48
 * ("use the google fonts database … I specifically would like Google Sans").
 *
 * The font is a per-browser preference, like density and text size: it is a
 * reading choice, not a school-wide rule. `applyFont` writes `--font-sans` on
 * <html>, which beats the `:root` value in index.css, so everything that uses
 * `font-sans` (the whole app) repaints at once. Outfit is still the default and
 * clears the override, so nothing changes for anyone who never opens the
 * picker.
 *
 * Ticket 0c2dcf15 adds the last choice on the list: paste a font link and use
 * that instead of the five built in. The link is a stylesheet, so it is stored
 * as {url, family} beside the choice and loaded as a <link> the first time it
 * is used. It is still per browser: a pasted link is a person's own free text,
 * not something to push to everyone else's screen.
 */
import { useEffect, useState } from 'react';
import { cleanFontFamily, fontFamilyFromLink, fontLinkProblem, normaliseFontLink } from './fontLink';

export interface FontOption {
  id: string;
  name: string;
  blurb: string;
  /** Everything after the family names, e.g. `sans-serif`. */
  stack: string;
  /** The family name as the font itself writes it. */
  family: string;
  /** A Google Fonts `family=` value, when it has to be fetched. */
  google?: string;
}

export const FONTS: FontOption[] = [
  {
    id: 'outfit',
    name: 'Outfit',
    blurb: 'The original. Round and friendly, but a bit curly.',
    family: 'Outfit',
    stack: 'sans-serif',
  },
  {
    id: 'inter',
    name: 'Inter',
    blurb: 'Plain and square. The least curly thing on the list.',
    family: 'Inter',
    stack: 'system-ui, sans-serif',
    google: 'Inter:wght@300..700',
  },
  {
    id: 'caladea',
    name: 'Caladea',
    blurb: 'The free stand-in for Constantia. Serifs, so it reads like print.',
    family: 'Caladea',
    stack: 'Georgia, serif',
    google: 'Caladea:ital,wght@0,400;0,700;1,400;1,700',
  },
  {
    id: 'google-sans',
    name: 'Google Sans',
    blurb: 'The one asked for on ticket 00bdfc48. Falls back to Inter if Google never sends it.',
    family: 'Google Sans',
    stack: "'Inter', system-ui, sans-serif",
    google: 'Google+Sans:wght@400;500;700',
  },
  {
    id: 'system',
    name: 'This computer',
    blurb: 'Whatever your Mac or PC already uses. Downloads nothing.',
    family: 'system-ui',
    stack: "-apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif",
  },
];

/** Ticket 0c2dcf15: the "your own font link" choice. Not in FONTS, since it only
 *  exists once somebody has pasted a link. */
export const CUSTOM_FONT_ID = 'custom';

/** What a pasted font link looks like once it is saved. */
export interface CustomFont {
  /** The stylesheet address. */
  url: string;
  /** The family name to ask for, e.g. "Open Sans". */
  family: string;
}

const KEY = 'ashtec-font';
const EVENT = 'ashtec-font';
const DEFAULT_ID = 'outfit';
const CUSTOM_KEY = 'ashtec-font-custom';
/** Behind a custom family, so a link that turns out to be empty still reads. */
const CUSTOM_STACK = 'system-ui, sans-serif';

export const findFont = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** The family stack to put on <html> for a pasted font. */
export function customFontStack(custom: CustomFont): string {
  return `'${custom.family}', ${CUSTOM_STACK}`;
}

/** The saved pasted font, or null when there is none (or it is unreadable). */
export function getCustomFont(): CustomFont | null {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<CustomFont> | null;
    const url = normaliseFontLink(saved?.url);
    if (!url || fontLinkProblem(url)) return null;
    const family = cleanFontFamily(saved?.family) || fontFamilyFromLink(url);
    if (!family) return null;
    return { url, family };
  } catch {
    return null;
  }
}

function readStoredId(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function getFont(): string {
  const stored = readStoredId();
  if (stored === CUSTOM_FONT_ID) return getCustomFont() ? CUSTOM_FONT_ID : DEFAULT_ID;
  return FONTS.some((f) => f.id === stored) ? stored : DEFAULT_ID;
}

/** One <link> per family, added the first time it is picked. */
const loaded = new Set<string>();

function loadFont(option: FontOption) {
  if (!option.google || loaded.has(option.id) || typeof document === 'undefined') return;
  loaded.add(option.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${option.google}&display=swap`;
  document.head.appendChild(link);
}

/** One <link> per pasted stylesheet, shared by everybody waiting on it. */
const loading = new Map<string, Promise<void>>();

/**
 * Add the pasted stylesheet to the page. Resolves when the browser has it,
 * rejects when it will not load (wrong address, offline, a host that says no),
 * so the settings box can say so instead of looking like it worked.
 */
export function loadCustomFont(url: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const href = normaliseFontLink(url);
  if (!href) return Promise.reject(new Error('There is no link to load.'));
  const already = loading.get(href);
  if (already) return already;

  const pending = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.ashtecFont = 'custom';

    const done = () => {
      link.onload = null;
      link.onerror = null;
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      done();
      link.remove();
      reject(new Error('That link did not load. Check the address, then try again.'));
    }, 10000);

    link.onload = () => {
      done();
      resolve();
    };
    link.onerror = () => {
      done();
      link.remove();
      reject(new Error('That link did not load. Check the address, then try again.'));
    };
    document.head.appendChild(link);
  });

  loading.set(href, pending);
  pending.catch(() => loading.delete(href));
  return pending;
}

export function applyFont(id: string) {
  const root = document.documentElement;
  if (id === CUSTOM_FONT_ID) {
    const custom = getCustomFont();
    if (!custom) {
      root.style.removeProperty('--font-sans');
      return;
    }
    void loadCustomFont(custom.url).catch(() => { /* keep the fallback stack */ });
    root.style.setProperty('--font-sans', customFontStack(custom));
    return;
  }
  const option = findFont(id);
  if (option.id === DEFAULT_ID) {
    root.style.removeProperty('--font-sans');
    return;
  }
  loadFont(option);
  root.style.setProperty('--font-sans', `'${option.family}', ${option.stack}`);
}

export function setFont(id: string) {
  if (id === CUSTOM_FONT_ID && !getCustomFont()) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: the change still applies for this page */
  }
  applyFont(id);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Save a pasted font link and switch to it. Throws the sentence to show the
 * person when the link is malformed, has no font name to go on, or will not
 * load, and leaves whatever they had before in place.
 */
export async function setCustomFont(link: string, family?: string): Promise<CustomFont> {
  const problem = fontLinkProblem(link);
  if (problem) throw new Error(problem);
  const url = normaliseFontLink(link);
  const name = cleanFontFamily(family) || fontFamilyFromLink(url);
  if (!name) {
    throw new Error('This link does not say which font it is. Type the font’s name as well, e.g. "Open Sans".');
  }
  const custom: CustomFont = { url, family: name };
  await loadCustomFont(url);
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  } catch {
    /* private mode: still used for this page */
  }
  applyFont(CUSTOM_FONT_ID);
  window.dispatchEvent(new Event(EVENT));
  return custom;
}

/** Forget the pasted font, going back to Outfit if it was the one in use. */
export function clearCustomFont(): void {
  try {
    localStorage.removeItem(CUSTOM_KEY);
  } catch {
    /* nothing to forget */
  }
  const stored = readStoredId();
  if (stored === CUSTOM_FONT_ID) {
    setFont(DEFAULT_ID);
    return;
  }
  applyFont(stored);
  window.dispatchEvent(new Event(EVENT));
}

/** Current font id, kept in step across tabs. */
export function useFont(): [string, (id: string) => void] {
  const [id, setId] = useState(getFont);
  useEffect(() => {
    const sync = () => setId(getFont());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [id, setFont];
}

/** The saved pasted font, kept in step across tabs. */
export function useCustomFont(): CustomFont | null {
  const [custom, setCustom] = useState<CustomFont | null>(getCustomFont);
  useEffect(() => {
    const sync = () => setCustom(getCustomFont());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return custom;
}
