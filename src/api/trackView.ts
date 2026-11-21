import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { findMemberByEmail } from '../lib/server';

/**
 * One page view, from the browser.
 *
 * Called by the little tracker in src/lib/tracker.ts on every route change,
 * signed in or not, because half the point is seeing what the public pages do.
 * The row deliberately holds no IP address, no user agent, and no query string
 * apart from the five utm fields, so this is a count of visits rather than a
 * record of people. `member` is filled in only when that browser was signed in
 * at the time, and only admins ever see it.
 *
 * Two guards keep the table from filling up with rubbish: a same-session,
 * same-path duplicate within two seconds is ignored (React re-renders and a
 * quick refresh), and one browser session is capped at 400 views an hour.
 */

const SKIP_PREFIXES = ['/api', '/assets', '/@', '/node_modules', '/favicon', '/uploads'];

/** Views per session per hour. A human clicking around will not get near this. */
const SESSION_CAP = 400;
const WINDOW_MS = 60 * 60 * 1000;

const seen = new Map<string, { count: number; since: number }>();

function overCap(sessionId: string): boolean {
  const now = Date.now();
  const slot = seen.get(sessionId);
  if (!slot || now - slot.since > WINDOW_MS) {
    seen.set(sessionId, { count: 1, since: now });
    // Cheap housekeeping so the map cannot grow forever on a long-lived server.
    if (seen.size > 5000) {
      for (const [k, v] of seen) if (now - v.since > WINDOW_MS) seen.delete(k);
    }
    return false;
  }
  slot.count += 1;
  return slot.count > SESSION_CAP;
}

/** Just the path: no query string, no hash, no trailing slash. */
function cleanPath(raw: string): string {
  let p = (raw || '/').split('?')[0].split('#')[0].trim();
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+$/, '') || '/';
  return p.slice(0, 180);
}

/** Host only, so the table never stores a full referring URL with its query. */
function hostOf(url: string): string {
  const v = (url || '').trim();
  if (!v) return '';
  try {
    return new URL(v).hostname.toLowerCase().replace(/^www\./, '').slice(0, 120);
  } catch {
    return '';
  }
}

const short = (max: number) => z.string().max(max).optional();

export default createEndpoint({
  description: 'Record one page view (public)',
  authenticated: false,
  inputSchema: z.object({
    path: z.string().max(400),
    referrer: short(400),
    sessionId: short(80),
    device: short(16),
    utmSource: short(120),
    utmMedium: short(120),
    utmCampaign: short(160),
    utmTerm: short(160),
    utmContent: short(160),
  }),
  outputSchema: z.object({ ok: z.boolean(), recorded: z.boolean() }),
  async execute({ input, context }) {
    const path = cleanPath(input.path);
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return { ok: true, recorded: false };
    }

    const sessionId = (input.sessionId ?? '').trim().slice(0, 80);
    if (!sessionId) return { ok: true, recorded: false };
    if (overCap(sessionId)) return { ok: true, recorded: false };

    // Same session, same page, within two seconds: a re-render, not a visit.
    const dupe = await zite.sql({
      query:
        'SELECT 1 FROM "PageViews" WHERE "sessionId" = $1 AND "path" = $2' +
        ' AND "createdAt" > now() - interval \'2 seconds\' LIMIT 1',
      params: [sessionId, path],
    });
    if (dupe.rows.length) return { ok: true, recorded: false };

    const device = ['phone', 'tablet', 'desktop'].includes(input.device ?? '')
      ? (input.device as string)
      : '';

    // Only signed-in visits carry a name. Lookup failures must not lose the view.
    let member: string | null = null;
    if (context.user?.email) {
      try {
        const found = await findMemberByEmail(context.user.email);
        member = found?.id ?? null;
      } catch {
        member = null;
      }
    }

    await zite.pageViews.create({
      record: {
        path,
        referrer: hostOf(input.referrer ?? ''),
        utmSource: (input.utmSource ?? '').trim().slice(0, 120),
        utmMedium: (input.utmMedium ?? '').trim().slice(0, 120),
        utmCampaign: (input.utmCampaign ?? '').trim().slice(0, 160),
        utmTerm: (input.utmTerm ?? '').trim().slice(0, 160),
        utmContent: (input.utmContent ?? '').trim().slice(0, 160),
        sessionId,
        member,
        device,
      },
    });

    // Old rows are not interesting after half a year; sweep now and then.
    if (Math.random() < 0.01) {
      await zite
        .sql({ query: 'DELETE FROM "PageViews" WHERE "createdAt" < now() - interval \'180 days\'' })
        .catch(() => undefined);
    }

    return { ok: true, recorded: true };
  },
});
