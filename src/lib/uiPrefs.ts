/**
 * Small per-device UI preferences.
 *
 * Deliberately localStorage rather than columns on CrewMembers: these only change
 * how the app looks on the machine you are sitting at. A crew member on a shared
 * school computer should not drag their layout choices onto everyone else's
 * account, and a layout preference is not worth a schema migration.
 */
import { useEffect, useState } from 'react';

const SUPPORT_COLLAPSED = 'ashtec-support-collapsed';
const SUPPORT_SAME_TAB = 'ashtec-support-same-tab';
const EVENT = 'ashtec-uiprefs';

const read = (key: string) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};
const write = (key: string, value: boolean) => {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch {}
  window.dispatchEvent(new Event(EVENT));
};

function useBoolPref(key: string) {
  const [value, setValue] = useState(() => read(key));
  useEffect(() => {
    // `storage` covers a second tab; the custom event covers this one, because
    // storage events do not fire in the tab that made the change.
    const sync = () => setValue(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);
  return [value, (next: boolean) => write(key, next)] as const;
}

/** Ticket 9c895ffb: whether the floating help button is shrunk to just its icon. */
export const useSupportCollapsed = () => useBoolPref(SUPPORT_COLLAPSED);

/** Ticket e9993904: whether the ticket list opens a ticket in this tab instead of a new one. */
export const useSupportSameTab = () => useBoolPref(SUPPORT_SAME_TAB);

/**
 * Ticket ad8dee46: the accent colour. The whole theme is driven by --primary, so
 * overriding that (plus --ring and --primary-foreground for contrast) restyles
 * buttons, links, the calendar and the tour in one go. Stored per browser for the
 * same reason as the button preference above.
 */
export type AccentId = 'amber' | 'red' | 'orange' | 'green' | 'blue' | 'purple' | 'pink';

export const ACCENTS: { id: AccentId; label: string; hsl: string; fg: string }[] = [
  { id: 'amber', label: 'Amber', hsl: '38 96% 56%', fg: '230 30% 7%' },
  { id: 'red', label: 'Red', hsl: '0 72% 55%', fg: '0 0% 100%' },
  { id: 'orange', label: 'Orange', hsl: '25 95% 55%', fg: '25 40% 8%' },
  { id: 'green', label: 'Green', hsl: '145 60% 45%', fg: '150 40% 6%' },
  { id: 'blue', label: 'Blue', hsl: '210 90% 58%', fg: '210 40% 6%' },
  { id: 'purple', label: 'Purple', hsl: '265 70% 62%', fg: '265 40% 8%' },
  { id: 'pink', label: 'Pink', hsl: '330 80% 62%', fg: '330 40% 8%' },
];

const ACCENT_KEY = 'ashtec-accent';
const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

export function getAccent(): AccentId {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return isAccent(v) ? v : 'amber';
  } catch {
    return 'amber';
  }
}

/** Inline styles beat the `.dark` rule, so this wins without touching the stylesheet. */
export function applyAccent(id: AccentId): void {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0];
  const root = document.documentElement.style;
  root.setProperty('--primary', a.hsl);
  root.setProperty('--ring', a.hsl);
  root.setProperty('--primary-foreground', a.fg);
}

export function useAccent() {
  const [id, setId] = useState<AccentId>(() => getAccent());
  useEffect(() => {
    const sync = () => {
      const next = getAccent();
      setId(next);
      applyAccent(next);
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = (next: AccentId) => {
    try { localStorage.setItem(ACCENT_KEY, next); } catch {}
    applyAccent(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [id, set] as const;
}
