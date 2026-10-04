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
import { getSessionUser, requestMagicLink, consumeMagicLink, setSessionCookie, destroySession, pruneAuth } from './auth.js';
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

app.get('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token ?? '');
  const raw = typeof req.query.callbackURL === 'string' ? req.query.callbackURL : '/';
  const callbackURL = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const user = token ? await consumeMagicLink(token) : null;
  if (!user) return res.status(400).send('That sign-in link has expired or was already used. Request a new one.');
  setSessionCookie(res, user);
  res.redirect(303, callbackURL);
});

app.post('/api/auth/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/session', async (req, res) => {
  res.json({ user: await getSessionUser(req) });
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