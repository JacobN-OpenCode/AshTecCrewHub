import { useEffect, useState } from 'react';
import { getSettings } from '#api';
import { DEFAULT_SETTINGS, type AppSettings } from './settings';

/**
 * App settings, fetched once and shared (feedback round 2). The settings page
 * writes through adminSaveSettings and then calls refreshAppSettings so the cat
 * name and skill list update without a reload.
 */
let cache: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;
const listeners = new Set<(s: AppSettings) => void>();

export function loadAppSettings(): Promise<AppSettings> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = getSettings({})
      .then((s) => {
        cache = {
          skillOptions: s.skillOptions ?? DEFAULT_SETTINGS.skillOptions,
          skillsEditable: s.skillsEditable !== false,
          catName: s.catName ?? DEFAULT_SETTINGS.catName,
          feedbackForms: s.feedbackForms ?? [],
        };
        listeners.forEach((l) => l(cache!));
        return cache;
      })
      .catch(() => { cache = { ...DEFAULT_SETTINGS }; return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function refreshAppSettings(): Promise<AppSettings> {
  cache = null;
  return loadAppSettings();
}

export function useAppSettings(): AppSettings {
  const [s, setS] = useState<AppSettings>(cache ?? DEFAULT_SETTINGS);
  useEffect(() => {
    let live = true;
    loadAppSettings().then((v) => { if (live) setS(v); });
    const l = (v: AppSettings) => setS(v);
    listeners.add(l);
    return () => { live = false; listeners.delete(l); };
  }, []);
  return s;
}
