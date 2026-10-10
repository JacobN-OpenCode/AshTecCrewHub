/**
 * Emergency admin sign-in, behind the cat.
 *
 * Deliberately NOT the normal auth path: it exists so a maintainer who cannot
 * receive the magic link (school mail filter, dead phone) can still get in by
 * knowing a passphrase. Only admins who have one set are eligible.
 *
 * The paired list of "email:hash" entries (or legacy "email:secret" cleartext
 * entries) lives in the AppSettings row "catLoginSecrets". Secrets are
 * hashed with sha256 before being stored, so a database leak does not give
 * the attacker the passphrases; the cleartext format is accepted only for
 * the existing entry written before the storage upgrade, and whichever admin
 * re-saves their secret through Settings migrates it to the hashed form.
 *
 * The comparison is constant-time on equal-length digests, so a wrong guess
 * cannot be timed.
 *
 * Per (email, IP) rate limiting lives in ../rateLimit.js (and a route handler
 * in ../index.ts) so a single source of bad guesses cannot burn through the
 * small keyspace of a PIN.
 */

import crypto from 'crypto';
import { db } from './db/index.js';

const HASH_ALG = 'sha256';

const sha256Hex = (s: string) => crypto.createHash(HASH_ALG).update(s).digest('hex');
const sha256Buf = (s: string) => crypto.createHash(HASH_ALG).update(s).digest();

/** True if `stored` looks like a hex-encoded sha256 digest (64 chars, [0-9a-f]). */
const isHex = (s: string) => /^[0-9a-f]{64}$/.test(s);

const sameSecret = (input: string, stored: string): boolean => {
  if (isHex(stored)) {
    const a = sha256Buf(input);
    const b = Buffer.from(stored, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  // Legacy cleartext entry - compare as-is. The legacy form disappears once
  // the admin re-saves their secret through Settings.
  const a = sha256Buf(input);
  const b = sha256Buf(stored);
  return crypto.timingSafeEqual(a, b);
};

async function secrets(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const add = (blob?: string) => {
    if (!blob) return;
    for (const pair of blob.split(',')) {
      const i = pair.indexOf(':');
      if (i <= 0) continue;
      out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
    }
  };
  add(process.env.ADMIN_LOGIN_SECRET);
  try {
    const { rows } = await db().query<{ value: string }>(
      `SELECT "value" FROM "AppSettings" WHERE "key" = $1`,
      [SETTING],
    );
    add(rows[0]?.value);
  } catch {
    // AppSettings may not exist on an old database; env alone still works.
  }
  return out;
}

const SETTING = 'catLoginSecrets';

/** Lists admin emails that currently have a non-empty cat-login secret set. */
export async function adminsWithSecrets(): Promise<string[]> {
  const map = await secrets();
  return Object.keys(map).filter((e) => !!map[e]);
}

/** Does THIS email have a configured secret (cleartext or hash, env or DB)? */
export async function hasSecret(email: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  return !!(await secrets())[key];
}

/**
 * Check an admin's cat-login secret WITHOUT creating a session, so a feature
 * that only needs to confirm "this is really an admin" (posting to the live
 * show chat from the stage board) does not have to hand out a cookie.
 * Returns true only when the secret matches AND the member is an admin.
 */
export async function verifyAdminSecret(email: string, password: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  const expected = (await secrets())[key];
  if (!expected || !sameSecret(password, expected)) return false;
  const { rows } = await db().query<{ isAdmin: boolean }>(
    `SELECT "isAdmin" FROM "CrewMembers" WHERE lower("schoolEmail") = $1`,
    [key],
  );
  return !!rows[0]?.isAdmin;
}

/** Returns a fresh session id on success, or null with nothing distinguishing why. */
export async function catLogin(email: string, password: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  const expected = (await secrets())[key];
  if (!expected || !sameSecret(password, expected)) return null;

  const { rows } = await db().query<{ firstName: string; lastName: string; isAdmin: boolean }>(
    `SELECT "firstName", "lastName", "isAdmin" FROM "CrewMembers" WHERE lower("schoolEmail") = $1`,
    [key],
  );
  const member = rows[0];
  if (!member?.isAdmin) return null;

  const sessionId = crypto.randomUUID();
  await db().query(
    `INSERT INTO "AuthSessions" ("id","email","firstName","lastName","expiresAt")
     VALUES ($1,$2,$3,$4, now() + interval '30 days')`,
    [sessionId, key, member.firstName ?? '', member.lastName ?? ''],
  );
  return sessionId;
}

/**
 * Set or clear an admin's secret in the AppSettings row.
 *
 * - The supplied value is hashed before being written so the DB never holds
 *   the cleartext passphrase.
 * - The legacy "email:cleartext" entries are upgraded to "email:hash" on
 *   the way out, so eventually all stored secrets are hashed.
 */
export async function writeSecret(email: string, value: string): Promise<void> {
  const key = email.trim().toLowerCase();
  const map = await secrets();
  if (!value) delete map[key];
  else map[key] = sha256Hex(value);
  await db().query(
    `INSERT INTO "AppSettings" ("key","value") VALUES ($1,$2)
     ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"`,
    [SETTING, Object.entries(map).map(([k, v]) => `${k}:${v}`).join(',')],
  );
}
