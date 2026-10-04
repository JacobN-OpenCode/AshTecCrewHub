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
