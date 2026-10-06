/**
 * The Express server: endpoint runner, auth routes, static SPA, scheduler.
 *
 * Endpoints are discovered from src/api/*.ts at boot rather than listed by
 * hand, so adding an endpoint is just adding a file (plus `npm run gen:api` for
 * the client). Each one is mounted at POST /api/<name>, which is exactly where
 * the generated client calls it.
 *
 * Authentication is enforced here rather than in each endpoint: every endpoint
 * declares `authenticated: true`, and an unauthenticated call is rejected before
 * `execute` runs. That mirrors Zite, and it is why none of the 33 handlers need
 * a null-check on context.user.
 */

import './env.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { ZiteError, type EndpointConfig, type ZiteSchedule, type ZiteScheduledContext } from './backend.js';
import {
  getSessionUser,
  requestMagicLink,
  consumeMagicLink,
  peekMagicLink,
  setSessionCookie,
  destroySession,
  pruneAuth,
} from './auth.js';
import { catLogin } from './catLogin.js';
import { verifyCalendarToken, buildMemberFeed } from './calendar.js';
import { db } from './db/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'src', 'api');
const PORT = Number(process.env.PORT ?? 1502);

type AnyEndpoint = EndpointConfig<any, any, any, any> & { name: string };

const statusFor = (code?: string) =>
  ({ UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 } as Record<string, number>)[
    code ?? ''
  ] ?? 500;

async function loadEndpoints(): Promise<AnyEndpoint[]> {
  const files = readdirSync(apiDir).filter((f) => f.endsWith('.ts'));
  const out: AnyEndpoint[] = [];
  for (const file of files.sort()) {
    const name = path.basename(file, '.ts');
    const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
    const cfg = (mod.default ?? mod[name]) as AnyEndpoint;
    if (cfg && typeof cfg.execute === 'function') out.push({ ...cfg, name });
    else console.warn(`[server] ${name}: no default export with execute(), skipped`);
  }
  return out;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

const endpoints = await loadEndpoints();
const byName = new Map(endpoints.map((e) => [e.name, e]));
console.log(`[server] loaded ${endpoints.length} endpoints`);

for (const ep of endpoints) {
  app.post(`/api/${ep.name}`, async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      if (ep.authenticated && !user) {
        return res.status(401).json({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Not signed in' });
      }

      let input: unknown = req.body ?? {};
      if (ep.inputSchema) {
        try {
          input = ep.inputSchema.parse(input);
        } catch (e: any) {
          return res.status(400).json({
            statusCode: 400,
            code: 'BAD_REQUEST',
            message: `Invalid input: ${e?.issues?.map((i: any) => `${i.path.join('.')} ${i.message}`).join('; ') ?? e?.message}`,
          });
        }
      }

      const context = { user: user ?? null, requestId: req.headers['x-request-id'] as string | undefined };
      const result = await ep.execute({ input, context: context as never });
      if (res.headersSent) return;
      res.json(result === undefined ? null : result);
    } catch (e: any) {
      if (res.headersSent) return;
      const isZite = e instanceof ZiteError;
      const status = isZite ? statusFor(e.code) : 500;
      if (!isZite || status >= 500) console.error(`[server] ${ep.name} failed:`, e);
      res.status(status).json({
        statusCode: status,
        code: isZite ? e.code : 'INTERNAL_ERROR',
        message: e?.message ?? 'Unexpected error',
        ...(isZite && e.userFacingMessage ? { userFacingMessage: e.userFacingMessage } : {}),
      });
    }
  });
}

// ---------------------------------------------------------------- auth routes
app.post('/api/auth/magic-link', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'That does not look like an email address.' });
  }
  const { rows } = await db().query('SELECT "firstName" FROM "CrewMembers" WHERE lower("schoolEmail") = $1', [email]);
  if (rows.length === 0) {
    // Same shape as success so this route cannot be used to enumerate the crew list.
    return res.json({ ok: true });
  }
  const callbackURL = typeof req.body?.callbackURL === 'string' && req.body.callbackURL.startsWith('/') ? req.body.callbackURL : '/';
  await requestMagicLink(email, String(req.body?.name ?? rows[0].firstName ?? ''), callbackURL);
  res.json({ ok: true });
});

/**
 * Small dark-themed pages for the sign-in link, matching the app.
 *
 * Why a confirmation step exists at all: the school's Barracuda mail gateway
 * prefetches links in inbound mail to scan them. When the link itself redeemed
 * the token, that GET consumed it about three seconds after the email was sent,
 * so the human always arrived at "expired or already used". Scanners issue GETs,
 * not form POSTs, so the GET now renders this page and only the POST redeems.
 * The script submits automatically, so a real browser still gets in with a click.
 */
const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function signInPage(title: string, inner: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<meta name="robots" content="noindex,nofollow" />' +
    `<title>${escapeAttr(title)}</title><style>` +
    'html,body{margin:0;height:100%}body{background:#0c0d13;color:#f3f1ed;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;' +
    'align-items:center;justify-content:center;padding:24px}' +
    'main{max-width:26rem;width:100%;text-align:center;background:#12141c;border:1px solid #2c2e3a;' +
    'border-radius:18px;padding:32px 28px;box-shadow:0 20px 50px rgba(0,0,0,.45)}' +
    'h1{font-size:1.4rem;margin:0 0 10px}p{color:#9ca3af;font-size:.95rem;line-height:1.55;margin:0 0 22px}' +
    'button{background:#f59e0b;color:#1a1206;border:0;border-radius:999px;padding:13px 26px;' +
    'font-size:1rem;font-weight:700;cursor:pointer}a{color:#f59e0b}' +
    '</style></head><body><main>' +
    inner +
    '</main></body></html>'
  );
}

const expiredPage = () =>
  signInPage(
    'Sign-in link expired',
    '<h1>That link is no longer valid</h1>' +
      '<p>It has expired or has already been used. Sign-in links work once and last 15 minutes.</p>' +
      '<p><a href="/">Request a new one</a></p>'
  );

// GET does NOT redeem: it renders a page whose form POSTs the token, so a mail
// scanner that follows the link cannot consume it. See signInPage above.
app.get('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token ?? '');
  const raw = typeof req.query.callbackURL === 'string' ? req.query.callbackURL : '/';
  const callbackURL = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  res.set('Cache-Control', 'no-store');
  const who = token ? await peekMagicLink(token) : null;
  if (!who) return res.status(400).type('html').send(expiredPage());

  const action = `/api/auth/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`;
  const first = who.firstName?.trim().split(/\s+/)[0] || 'there';
  res.type('html').send(
    signInPage(
      'Signing you in',
      `<h1>Sign in as ${escapeAttr(first)}?</h1>` +
        '<p>Tap below to finish signing in to the AshTec crew hub.</p>' +
        `<form method="post" action="${escapeAttr(action)}">` +
        '<button type="submit">Sign in</button></form>' +
        '<script>document.forms[0].submit()</script>'
    )
  );
});

// POST is what actually redeems the single-use token and sets the session.
app.post('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token ?? req.body?.token ?? '');
  const raw = String(req.query.callbackURL ?? req.body?.callbackURL ?? '/');
  const callbackURL = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const user = token ? await consumeMagicLink(token) : null;
  if (!user) return res.status(400).type('html').send(expiredPage());
  setSessionCookie(res, user);
  res.redirect(303, callbackURL);
});

app.post('/api/auth/logout', async (req, res) => {  await destroySession(req, res);
  res.json({ ok: true });
});

/**
 * Cat easter-egg sign-in. Validates through the catAdminLogin endpoint, then sets
 * the session cookie here so the cookie is HTTP-only and the token never has to
 * be handled by client JavaScript.
 */
app.post('/api/auth/cat-login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ message: 'Enter both your email and the password.' });
  try {
    const token = await catLogin(email, password);
    if (!token) return res.status(401).json({ message: 'Those details are not right.' });
    res.cookie('crew_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.APP_URL ?? '').startsWith('https://'),
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[server] cat-login failed:', e);
    res.status(500).json({ message: 'That did not work. Try again.' });
  }
});

app.get('/api/auth/session', async (req, res) => {
  res.json({ user: await getSessionUser(req) });
});

/**
 * The subscribe-to-calendar feed (ticket ab308aca). A stable text/calendar URL a
 * member adds to Apple/Google/Outlook once, which then updates itself as events
 * change - unlike the one-off .ics download.
 *
 * Per-member and unguessable: the token is the member id plus an HMAC, so the
 * feed only ever contains that member's events.
 */
app.get('/calendar.ics', async (req, res) => {
  const token = String(req.query.token ?? '');
  const memberId = token ? await verifyCalendarToken(token) : null;
  if (!memberId) return res.status(404).type('text/plain').send('Not found');
  try {
    const ics = await buildMemberFeed(memberId);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    // Calendars poll; a short private cache keeps it fresh without hammering us.
    res.set('Cache-Control', 'private, max-age=300');
    res.send(ics);
  } catch (e) {
    console.error('[calendar] feed failed:', e);
    res.status(500).type('text/plain').send('Could not build the calendar.');
  }
});

app.get('/healthz', async (_req, res) => {
  try {
    await db().query('SELECT 1');
    res.json({ ok: true, endpoints: endpoints.length });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e?.message });
  }
});

// --------------------------------------------------------------- static + spa
const dist = path.join(root, 'dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get(/^\/(?!api\/|healthz).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));

// ----------------------------------------------------------------- scheduler
const matchesSchedule = (s: ZiteSchedule | undefined, now: Date): boolean => {
  if (!s || s.scheduleType !== 'recurring') return false;
  const tz = s.timezone ?? 'Europe/London';
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(now)
  );
  const minute = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, minute: 'numeric' }).format(now));
  if (s.schedule.frequency !== 'hourly' || minute !== 0) return false;
  // A daily/weekly job names the hour it wants; `interval` on its own would only
  // ever land on midnight (hour % 24 === 0), which is useless for reminders.
  if (s.schedule.atHour !== undefined) return hour === s.schedule.atHour;
  return hour % (s.schedule.interval || 1) === 0;
};

let lastFiredHour = '';
async function schedulerTick() {
  const now = new Date();
  const key = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).format(now);
  if (key === lastFiredHour) return;
  for (const ep of endpoints) {
    if (!matchesSchedule(ep.schedule, now)) continue;
    lastFiredHour = key;
    console.log(`[scheduler] firing ${ep.name}`);
    try {
      await ep.execute({ input: {}, context: { user: null, scheduledAt: now.toISOString() } as ZiteScheduledContext as never });
    } catch (e) {
      console.error(`[scheduler] ${ep.name} failed:`, e);
    }
  }
}

await pruneAuth().catch((e) => console.error('[server] pruneAuth failed:', e));
setInterval(() => void schedulerTick(), 60_000).unref();
setInterval(() => void pruneAuth().catch(() => {}), 3_600_000).unref();

app.listen(PORT, () => {
  console.log(`[server] AshTec Crew Hub listening on :${PORT} (app url ${process.env.APP_URL ?? 'unset'})`);
  if (!byName.size) console.warn('[server] no endpoints mounted');
});