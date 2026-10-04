/**
 * Emergency admin sign-in, behind the cat.
 *
 * Deliberately NOT the normal auth path: it exists so a maintainer who cannot
 * receive the magic link (school mail filter, dead phone) can still get in by
 * knowing a passphrase. Only admins who have one set are eligible.
 *
 * The passphrase is read from ADMIN_LOGIN_SECRET (comma-separated
 * "email:secret" pairs) or, failing that, the AppSettings row
 * "catLoginSecrets". Keeping it server-side is the whole point - it must never
 * reach the client bundle. The comparison is constant-time via fixed-length
 * digests, so a wrong guess cannot be timed.
 */

import crypto from 'crypto';
import { db } from './db/index.js';

const hash = (s: string) => crypto.createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => crypto.timingSafeEqual(hash(a), hash(b));

async function secrets(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const add = (blob?: string) => {
    if (!blob) return;
    for (const pair of blob.split(',')) {
      const i = pair.indexOf(':');
      if (i > 0) out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
    }
  };
  add(process.env.ADMIN_LOGIN_SECRET);
  try {
    const { rows } = await db().query<{ value: string }>(
      `SELECT "value" FROM "AppSettings" WHERE "key" = 'catLoginSecrets'`
    );
    add(rows[0]?.value);
  } catch {
    // AppSettings may not exist on an old database; env alone still works.
  }
  return out;
}

/** Returns a fresh session id on success, or null with nothing distinguishing why. */
export async function catLogin(email: string, password: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  const expected = (await secrets())[key];
  if (!expected || !sameSecret(password, expected)) return null;

  const { rows } = await db().query<{ firstName: string; lastName: string; isAdmin: boolean }>(
    `SELECT "firstName", "lastName", "isAdmin" FROM "CrewMembers" WHERE lower("schoolEmail") = $1`,
    [key]
  );
  const member = rows[0];
  if (!member?.isAdmin) return null;

  const sessionId = crypto.randomUUID();
  await db().query(
    `INSERT INTO "AuthSessions" ("id","email","firstName","lastName","expiresAt")
     VALUES ($1,$2,$3,$4, now() + interval '30 days')`,
    [sessionId, key, member.firstName ?? '', member.lastName ?? '']
  );
  return sessionId;
}
