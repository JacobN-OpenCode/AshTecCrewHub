/**
 * Tiny in-memory rate limiter for the cat-login route.
 *
 * Why a rate limiter exists here at all: small PIN-style secrets cannot be
 * brute-forced quickly enough on a network, but a script trying 1000 guesses
 * from one IP would win against a 4-digit PIN. Five failed attempts from the
 * same (email, IP) pair unlocks after 15 minutes; a rolling total of 30
 * failures across any emails locks that IP out for an hour.
 *
 * The state is per-process: each Express server has its own counters, which
 * is fine because the production box runs one process. If we ever scale to
 * multiple replicas, this is the file we move to Redis.
 */

type Bucket = { failCount: number; lockUntil: number };

const buckets = new Map<string, Bucket>();
const ipFailures = new Map<string, number>();

const KEY = (email: string, ip: string) => `${email.toLowerCase()}|${ip}`;

/**
 * Returns the milliseconds until this (email, ip) is allowed to try again,
 * or 0 if the bucket is open. Locks clear themselves when read again.
 */
export function locked(email: string, ip: string): number {
  const k = KEY(email, ip);
  const b = buckets.get(k);
  if (!b || !b.lockUntil) return 0;
  if (b.lockUntil <= Date.now()) {
    buckets.delete(k);
    return 0;
  }
  return b.lockUntil - Date.now();
}

/** Record a failed guess and (possibly) lock the bucket. */
export function recordFailure(email: string, ip: string): { lockMs: number } | null {
  const k = KEY(email, ip);
  const now = Date.now();
  const b = buckets.get(k) ?? { failCount: 0, lockUntil: 0 };
  b.failCount += 1;
  // 5 failures on the same target -> 15 minute pin lock
  if (b.failCount >= 5) b.lockUntil = now + 15 * 60 * 1000;
  buckets.set(k, b);
  // Also track per-IP, slightly more forgiving
  const prevIp = ipFailures.get(ip) ?? 0;
  const nextIp = prevIp + 1;
  ipFailures.set(ip, nextIp);
  // 30 failures across any emails -> 60 minute IP lock
  const IP_LOCK = 60 * 60 * 1000;
  if (nextIp >= 30) {
    buckets.set(KEY('*', ip), { failCount: nextIp, lockUntil: now + IP_LOCK });
  }
  if (b.failCount >= 5) return { lockMs: 15 * 60 * 1000 };
  return null;
}

/** A successful guess clears the bucket for that (email, ip). */
export function recordSuccess(email: string, ip: string): void {
  buckets.delete(KEY(email, ip));
}

/** Hourly cleanup so the map doesn't grow forever with old buckets. */
export function gc(): void {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (!b.lockUntil || b.lockUntil <= now) buckets.delete(k);
  }
  for (const k of ipFailures.keys()) {
    if (!buckets.has(KEY('*', k))) ipFailures.delete(k);
  }
}
