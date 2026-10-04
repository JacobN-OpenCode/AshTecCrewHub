/**
 * Magic-link sign-in and DB-backed sessions, replacing `zitejs/auth`.
 *
 * The original app used Zite's hosted auth: the client called
 * `signIn.magicLink({ email, name, callbackURL })`, Zite emailed a link, and the
 * link set an HTTP-only session cookie. We keep that exact client-visible
 * contract and reimplement it here against Postgres, so LoginScreen.tsx,
 * AppShell.tsx, ApprovePresence.tsx and App.tsx need no changes beyond their
 * import specifier.
 *
 * Tokens are single-use and short-lived; sessions are long-lived and sliding.
 * The cookie is first-party because the browser only ever talks to one origin
 * (Vite proxies /api in dev, Caddy proxies it in production), which is what lets
 * us use a plain SameSite=Lax cookie with no CORS dance.
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import { db } from './db/index.js';
import { Email } from './email.js';

const SESSION_COOKIE = 'crew_session';
const TOKEN_TTL_MIN = 15;
const SESSION_TTL_DAYS = 30;

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

const parseCookies = (header?: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
};

/** Resolve the signed-in user from the session cookie, or null. */
export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await db().query(
    `SELECT "id", "email", "firstName", "lastName" FROM "AuthSessions"
      WHERE "id" = $1 AND "expiresAt" > now()`,
    [token]
  );
  return rows[0] ?? null;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await db().query('DELETE FROM "AuthSessions" WHERE "id" = $1', [token]).catch(() => {});
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Create a single-use token and email the link. Returns nothing on failure for
 * the caller to distinguish: the UI must not reveal whether an address is on the
 * crew list (LoginScreen already gates that with checkEmail).
 */
export async function requestMagicLink(email: string, name: string, callbackURL = '/'): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    `INSERT INTO "AuthMagicTokens" ("token", "email", "firstName", "expiresAt")
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [token, email, name, String(TOKEN_TTL_MIN)]
  );

  const link = `${appUrl()}/api/auth/verify?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`;
  const first = name?.trim().split(/\s+/)[0] || 'there';
  await Email.send({
    to: email,
    subject: 'Your AshTec Crew sign-in link',
    body: [
      {
        type: 'text',
        content:
          `Hi ${first}!\n\n` +
          `Click the button below to sign in to the AshTec crew hub. The link works once and ` +
          `expires in ${TOKEN_TTL_MIN} minutes. If you did not ask for it, you can ignore this email.`,
      },
      { type: 'button', label: 'Sign in to the crew hub', href: link },
    ],
  });
}

/**
 * Look at a token without redeeming it. The GET side of the sign-in link uses
 * this so a mail gateway that prefetches links to scan them does not burn the
 * single-use token before the human clicks (the school's Barracuda gateway was
 * doing exactly that, ~3s after each send). Only the POST consumes.
 */
export async function peekMagicLink(token: string): Promise<{ email: string; firstName: string } | null> {
  const { rows } = await db().query(
    `SELECT "email", "firstName" FROM "AuthMagicTokens"
      WHERE "token" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()`,
    [token]
  );
  return rows[0] ?? null;
}

/**
 * Consume a token and open a session. The `usedAt IS NULL` predicate makes this
 * single-use even if the link is opened twice concurrently.
 */
export async function consumeMagicLink(token: string): Promise<AuthUser | null> {
  const { rows } = await db().query(
    `UPDATE "AuthMagicTokens"
        SET "usedAt" = now()
      WHERE "token" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()
      RETURNING "email", "firstName", "lastName"`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;

  // Prefer the crew row's name so a stale token cannot pin an outdated name.
  const crew = await db().query(
    `SELECT "firstName", "lastName" FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1)`,
    [row.email]
  );
  const firstName = crew.rows[0]?.firstName ?? row.firstName;
  const lastName = crew.rows[0]?.lastName ?? row.lastName ?? '';

  const sessionId = crypto.randomUUID();
  await db().query(
    `INSERT INTO "AuthSessions" ("id", "email", "firstName", "lastName", "expiresAt")
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [sessionId, row.email, firstName ?? '', lastName ?? '', String(SESSION_TTL_DAYS)]
  );
  return { id: sessionId, email: row.email, firstName: firstName ?? '', lastName };
}

export function setSessionCookie(res: Response, user: AuthUser): void {
  res.cookie(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Housekeeping: drop spent tokens and expired sessions. Called on boot + hourly. */
export async function pruneAuth(): Promise<void> {
  await db().query('DELETE FROM "AuthMagicTokens" WHERE "expiresAt" < now() - interval \'1 day\'');
  await db().query('DELETE FROM "AuthSessions" WHERE "expiresAt" < now()');
}