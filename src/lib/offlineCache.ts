/**
 * Batch 6: a last-good cache for the read-only calls a show day depends on.
 *
 * The service worker already serves the app shell offline, so the only thing
 * missing was the data. We cannot cache POSTs in the SW (they are not GETs and
 * carry a session cookie), so the app keeps the last successful response for a
 * few list endpoints in localStorage and falls back to it when a fetch fails.
 *
 * Only ever used for reads that are safe to show stale (your own events, your
 * schedule, your profile). Writes are never cached.
 */

import { useEffect, useState } from 'react';

const PREFIX = 'ashtec-cache:';
/** A day is plenty; an event list from last week is more confusing than none. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Entry<T> {
  at: number;
  data: T;
}

function readEntry<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Run `fn` and cache its result; if it throws (offline, server down) fall back
 * to the last good value. Returns the data plus whether it was stale, so the UI
 * can say "showing offline data" rather than pretending it is live.
 */
export async function cachedGet<T>(key: string, fn: () => Promise<T>): Promise<{ data: T; stale: boolean; at: number | null }> {
  try {
    const data = await fn();
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies Entry<T>));
    } catch {
      /* storage full or disabled; the fresh data is still returned */
    }
    return { data, stale: false, at: Date.now() };
  } catch (e) {
    const cached = readEntry<T>(key);
    if (cached && Date.now() - cached.at < MAX_AGE_MS) return { data: cached.data, stale: true, at: cached.at };
    throw e;
  }
}

/** The last good value, synchronously, for an offline first paint. */
export function peekCached<T>(key: string): { data: T; at: number } | null {
  const entry = readEntry<T>(key);
  if (!entry || Date.now() - entry.at > MAX_AGE_MS) return null;
  return { data: entry.data, at: entry.at };
}

export function clearCached(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Reactive navigator.onLine. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
