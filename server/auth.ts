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
/**
 * Admin "log in as" (impersonation). Holds the id of the member the admin is
 * acting as, never their credentials. It is only ever set by /api/actAs, which
 * first checks the real session belongs to an admin, and it is re-checked on
 * every request, so a demoted admin or an expired session cannot keep using it.
 * A session cookie (no maxAge), so closing the browser drops it.
 */
const ACT_AS_COOKIE = 'crew_act_as';
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

/** The session behind the cookie, ignoring any admin "log in as". */
export async function getRealSessionUser(req: Request): Promise<AuthUser | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await db().query(
    `SELECT "id", "email", "firstName", "lastName" FROM "AuthSessions"
      WHERE "id" = $1 AND "expiresAt" > now()`,
    [token]
  );
  if (!rows[0]) return null;
  // Touch the device's last-seen time, but at most every few minutes so a busy
  // page does not write on every request.
  await db().query(
    `UPDATE "AuthSessions" SET "lastSeenAt" = now()
      WHERE "id" = $1 AND "lastSeenAt" < now() - interval '5 minutes'`,
    [token]
  ).catch(() => {});
  return rows[0] ?? null;
}

/**
 * The admin behind an active "log in as", and the member they are acting as, or
 * null when nobody is impersonating. Re-validated on every call: the act-as
 * cookie is worthless without a live admin session behind it.
 */
export async function getActAs(
  req: Request
): Promise<{ admin: AuthUser; member: AuthUser } | null> {
  const memberId = parseCookies(req.headers.cookie)[ACT_AS_COOKIE];
  if (!memberId) return null;
  const real = await getRealSessionUser(req);
  if (!real) return null;
  const { rows } = await db().query(
    `SELECT "id", "schoolEmail", "firstName", "lastName", "isAdmin"
       FROM "CrewMembers" WHERE lower("schoolEmail") = $1`,
    [real.email.toLowerCase()]
  );
  const admin = rows[0];
  if (!admin?.isAdmin) return null;
  if (admin.id === memberId) return null;
  const { rows: target } = await db().query(
    `SELECT "id", "schoolEmail", "firstName", "lastName" FROM "CrewMembers" WHERE "id" = $1`,
    [memberId]
  );
  if (!target[0]) return null;
  return {
    admin: { id: admin.id, email: admin.schoolEmail, firstName: admin.firstName, lastName: admin.lastName },
    member: {
      id: target[0].id,
      email: target[0].schoolEmail,
      firstName: target[0].firstName,
      lastName: target[0].lastName,
    },
  };
}

/**
 * Resolve the signed-in user from the session cookie, or null.
 *
 * When an admin is acting as another member this returns that member, so every
 * endpoint acts as them and anything they do is saved as them. The real admin is
 * still the one behind the session (see getActAs), which is what lets them leave.
 */
export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  const real = await getRealSessionUser(req);
  if (!real) return null;
  const act = await getActAs(req).catch(() => null);
  if (!act) return real;
  return {
    id: act.member.id,
    email: act.member.email,
    firstName: act.member.firstName,
    lastName: act.member.lastName,
  };
}

/** Start acting as another member. The caller's own session must be an admin's. */
export async function startActAs(req: Request, res: Response, memberId: string): Promise<AuthUser> {
  const real = await getRealSessionUser(req);
  if (!real) throw new Error('Sign in first.');
  const { rows } = await db().query(
    `SELECT "id", "isAdmin" FROM "CrewMembers" WHERE lower("schoolEmail") = $1`,
    [real.email.toLowerCase()]
  );
  const admin = rows[0];
  if (!admin?.isAdmin) throw new Error('Admins only.');
  if (admin.id === memberId) throw new Error('That is your own account.');
  const { rows: target } = await db().query(
    `SELECT "id", "schoolEmail", "firstName", "lastName" FROM "CrewMembers" WHERE "id" = $1`,
    [memberId]
  );
  if (!target[0]) throw new Error('No such crew member.');
  res.cookie(ACT_AS_COOKIE, memberId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    path: '/',
  });
  const t = target[0];
  return { id: t.id, email: t.schoolEmail, firstName: t.firstName, lastName: t.lastName };
}

/** Stop acting as someone and go back to being yourself. */
export function stopActAs(res: Response): void {
  res.clearCookie(ACT_AS_COOKIE, { path: '/' });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await db().query('DELETE FROM "AuthSessions" WHERE "id" = $1', [token]).catch(() => {});
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  // Signing out must not leave an impersonation cookie behind.
  stopActAs(res);
}

/**
 * Create a single-use token and email the link. Returns nothing on failure for
 * the caller to distinguish: the UI must not reveal whether an address is on the
 * crew list (LoginScreen already gates that with checkEmail).
 */
export async function requestMagicLink(
  email: string,
  name: string,
  callbackURL = '/',
  appScheme?: string,
): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db().query(
    `INSERT INTO "AuthMagicTokens" ("token", "email", "firstName", "expiresAt")
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [token, email, name, String(TOKEN_TTL_MIN)]
  );

  // The Mac app asks for its own scheme, so the emailed link opens the app
  // (which then loads the https verify URL in its own window and sets the
  // cookie there) instead of landing in Safari.
  const webLink = `${appUrl()}/api/auth/verify?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`;
  const appLink = appScheme
    ? `${appScheme}://verify?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`
    : null;
  const first = name?.trim().split(/\s+/)[0] || 'there';
  // A mail client that will not make a custom-scheme link clickable (Gmail and
  // others strip unknown schemes) would otherwise leave the app user stuck, so
  // the web link is always included as a fallback line too.
  const text =
    `Hi ${first}!\n\n` +
    `Click the button below to sign in to the AshTec crew hub. The link works once and ` +
    `expires in ${TOKEN_TTL_MIN} minutes. If you did not ask for it, you can ignore this email.` +
    (appLink ? `\n\nIf the button does nothing, open this link instead:\n${webLink}` : '');
  await Email.send({
    to: email,
    subject: 'Your AshTec Crew sign-in link',
    body: [
      { type: 'text', content: text },
      { type: 'button', label: 'Sign in to the crew hub', href: appLink ?? webLink },
    ],
  });
  // Log the send so the admin Emails tab shows every message the system emits.
  // Only the plain text is stored, never the button href: that href carries the
  // one-time token, and anyone able to read this tab would otherwise be able to
  // sign in as the recipient for the next TOKEN_TTL_MIN minutes. A failure here
  // must not break sign-in, hence the catch.
  try {
    const { rows: mm } = await db().query(
      `SELECT "id" FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1)`,
      [email]
    );
    await db().query(
      `INSERT INTO "EmailLog" ("id", "subject", "member", "recipientEmail", "purpose", "body", "sentBy", "sentAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 'Sign-in Link', $4, '', now())`,
      ['Your AshTec Crew sign-in link', mm[0]?.id ?? null, email, text]
    );
  } catch (err) {
    console.warn('[email] could not log sign-in email:', (err as Error).message);
  }
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
export async function consumeMagicLink(
  token: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<AuthUser | null> {
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
    `INSERT INTO "AuthSessions" ("id", "email", "firstName", "lastName", "expiresAt", "userAgent", "ip", "lastSeenAt")
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval, $6, $7, now())`,
    [sessionId, row.email, firstName ?? '', lastName ?? '', String(SESSION_TTL_DAYS), meta.userAgent ?? '', meta.ip ?? '']
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