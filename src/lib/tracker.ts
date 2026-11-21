import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackView } from '#api';

/**
 * The bit that counts a page view.
 *
 * Runs on every route change, signed in or not, because the public pages are
 * half of what is interesting. Three things are deliberately kept: the path,
 * the host of wherever the visitor came from, and any utm tags on the link they
 * followed. No IP, no user agent, no query string.
 *
 * The utm tags only exist on the campaign link itself, so they are copied into
 * sessionStorage the moment someone lands with them, and sent with every view
 * for the rest of that visit. Otherwise a campaign would only ever count its
 * landing page.
 */

const UTM_KEY = 'ashtec-utm';
const SESSION_KEY = 'ashtec-visit';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

type Utms = Partial<Record<(typeof UTM_FIELDS)[number], string>>;

function sessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readStored(): Utms {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as Utms) : {};
  } catch {
    return {};
  }
}

function utms(): Utms {
  const search = new URLSearchParams(window.location.search);
  const fresh: Utms = {};
  for (const field of UTM_FIELDS) {
    const value = search.get(field);
    if (value) fresh[field] = value;
  }
  if (!Object.keys(fresh).length) return readStored();
  const merged = { ...readStored(), ...fresh };
  try {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(merged));
  } catch {
    /* private mode with storage off: the tags just do not persist */
  }
  return merged;
}

function device(): string {
  const width = window.innerWidth;
  if (width < 640) return 'phone';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

let lastKey = '';

/** Counts one view. A repeat of the same path and query in one moment is a re-render. */
export function trackPage(path: string) {
  if (!path || path.startsWith('/api')) return;
  const key = `${path}?${window.location.search}`;
  if (key === lastKey) return;
  lastKey = key;
  const u = utms();
  void Promise.resolve(
    trackView({
      path,
      referrer: document.referrer || undefined,
      sessionId: sessionId(),
      device: device(),
      utmSource: u.utm_source,
      utmMedium: u.utm_medium,
      utmCampaign: u.utm_campaign,
      utmTerm: u.utm_term,
      utmContent: u.utm_content,
    }),
  ).catch(() => undefined);
}

/** Mount once, inside the router. */
export function usePageViews() {
  const loc = useLocation();
  useEffect(() => {
    trackPage(loc.pathname);
  }, [loc.pathname]);
}
