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
 */
import { useEffect, useState } from 'react';

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

const KEY = 'ashtec-font';
const EVENT = 'ashtec-font';
const DEFAULT_ID = 'outfit';

export const findFont = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export function getFont(): string {
  try {
    const id = localStorage.getItem(KEY) ?? '';
    return FONTS.some((f) => f.id === id) ? id : DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
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

export function applyFont(id: string) {
  const option = findFont(id);
  const root = document.documentElement;
  if (option.id === DEFAULT_ID) {
    root.style.removeProperty('--font-sans');
    return;
  }
  loadFont(option);
  root.style.setProperty('--font-sans', `'${option.family}', ${option.stack}`);
}

export function setFont(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: the change still applies for this page */
  }
  applyFont(id);
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
