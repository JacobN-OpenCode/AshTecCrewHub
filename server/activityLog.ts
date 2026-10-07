/**
 * Activity logging for the "Logs" popup on Server diagnostics.
 *
 * Two writers:
 *  - logRequest() runs from a middleware on every HTTP request the server
 *    handles. It records method, path, status code and latency, resolves the
 *    signed-in member from the session cookie (if any) and stores the device
 *    and referring page so an admin can trace "who did what, from where".
 *  - logPageView() / setViewDuration() serve the client page-view beacons.
 *    SPA navigation never hits the server as a request, so the browser tells
 *    us which page it opened (and what it came from), and reports how long it
 *    stayed with a keep-alive beacon when it leaves.
 *
 * Logging is deliberately fire-and-forget: a failure here must never slow down
 * or break the request it is describing, hence the try/catch in every entry.
 *
 * Body content is never stored, only paths. Query strings are not part of
 * req.path, so authentication tokens in URLs (sign-in links) cannot leak here.
 */

import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { db } from './db/index.js';
import { getSessionUser } from './auth.js';

const MAX_PATH = 200;
const MAX_UA = 300;
const MAX_REF = 500;
const MAX_EMAIL = 200;

interface Row {
  id?: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  viewSeconds: number;
  authorized: boolean;
  email: string;
  ip: string;
  userAgent: string;
  referer: string;
}

async function insert(r: Row): Promise<string | null> {
  try {
    const { rows } = await db().query(
      `INSERT INTO "RequestLogs"
         ("id", "method", "path", "status", "latencyMs", "viewSeconds",
          "authorized", "email", "ip", "userAgent", "referer")
       VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ("id") DO NOTHING
       RETURNING "id"`,
      [r.method, r.path, r.status, r.latencyMs, r.viewSeconds, r.authorized, r.email, r.ip, r.userAgent, r.referer, r.id ?? randomUUID()]
    );
    return rows[0]?.id as string | null ?? null;
  } catch (e) {
    console.error('[activity] could not log request:', (e as Error).message);
    return null;
  }
}

const fromReq = (req: Request) => ({
  ip: String(req.ip ?? '').slice(0, 64),
  userAgent: String(req.headers['user-agent'] ?? '').slice(0, MAX_UA),
  referer: String(req.headers.referer ?? '').slice(0, MAX_REF),
});

/** Log one request. Skips the beacon/health paths so the logs do not drown in them. */
export async function logRequest(req: Request, w: { latencyMs: number; status: number }): Promise<void> {
  const path = req.path.slice(0, MAX_PATH);
  if (path.startsWith('/api/analytics') || path === '/healthz') return;
  const user = await getSessionUser(req).catch(() => null);
  await insert({
    method: req.method,
    path,
    status: w.status,
    latencyMs: w.latencyMs,
    viewSeconds: 0,
    authorized: !!user,
    email: (user?.email ?? '').slice(0, MAX_EMAIL),
    ...fromReq(req),
  });
}

/**
 * Client page view. The client picks a fresh uuid per view and passes it as
 * viewId; we insert with that id so its leave beacon can target the exact row.
 * Returns the id it inserted, or the uuid the server generated if the client
 * did not supply one.
 */
export async function logPageView(
  req: Request,
  b: { viewId?: string; path?: string; referer?: string }
): Promise<string | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.viewId ?? '')
    ? b.viewId!
    : randomUUID();
  const user = await getSessionUser(req).catch(() => null);
  const id = await insert({
    id: uuid,
    method: 'view',
    path: String(b.path ?? '').slice(0, MAX_PATH),
    status: 200,
    latencyMs: 0,
    viewSeconds: 0,
    authorized: !!user,
    email: (user?.email ?? '').slice(0, MAX_EMAIL),
    ...fromReq(req),
    referer: String(b.referer ?? '').slice(0, MAX_REF),
  });
  return id;
}

/** The leave beacon: fill in how long the member stayed on a view. */
export async function setViewDuration(args: { viewId: string; seconds: number }): Promise<void> {
  try {
    const s = Math.max(0, Math.round(Number(args.seconds) || 0));
    await db().query(
      `UPDATE "RequestLogs" SET "viewSeconds" = $2 WHERE "id" = $1 AND "method" = 'view'`,
      [args.viewId, s]
    );
  } catch (e) {
    console.error('[activity] could not store view duration:', (e as Error).message);
  }
}

/** Housekeeping: drop activity older than 30 days. Hourly, alongside pruneAuth. */
export async function pruneActivity(): Promise<void> {
  await db().query(`DELETE FROM "RequestLogs" WHERE "at" < now() - interval '30 days'`).catch(() => {});
}