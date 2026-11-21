/**
 * Which copy of the Mac app is this? (ticket c80f5a65)
 *
 * The Mac app opens the site as `/?app=1.1`, where 1.1 is the bundle version it
 * was built with. We remember that for this browser, and the downloads page
 * compares it against `/downloads/latest.json`, which macapp/build.sh writes
 * each time the app is built.
 *
 * Nothing here is clever: it is a number in localStorage and a small JSON file.
 * The app cannot replace itself (that needs Apple's Sparkle framework and a
 * signed app, neither of which the crew has), so "update" means: the app tells
 * you a newer one exists and opens the download page with one click.
 */

const KEY = 'ashtec-app-version';

/** Call once at boot: picks up `?app=1.1` if the page was opened by the app. */
export function noteAppVersion(): void {
  try {
    const v = new URLSearchParams(window.location.search).get('app');
    if (v) localStorage.setItem(KEY, v.trim().slice(0, 24));
  } catch {
    /* storage off, or no query string. Either way there is nothing to do. */
  }
}

/** The version of the Mac app this browser has been opened from, or ''. */
export function appVersion(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export interface LatestApp {
  version: string;
  url: string;
  releasedAt?: string;
  notes?: string;
}

/** Reads /downloads/latest.json. Returns null when it is missing or unreadable. */
export async function fetchLatestApp(): Promise<LatestApp | null> {
  try {
    const res = await fetch('/downloads/latest.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<LatestApp>;
    if (!data.version || !data.url) return null;
    return { version: String(data.version), url: String(data.url), releasedAt: data.releasedAt, notes: data.notes };
  } catch {
    return null;
  }
}

/** "1.10" vs "1.9": compare the numeric parts, not the strings. */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map((n) => Number(n) || 0);
  const b = current.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
