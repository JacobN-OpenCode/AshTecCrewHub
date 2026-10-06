/**
 * Subscribe-to-calendar feed.
 *
 * The old .ics download was a snapshot: move a rehearsal and the member has to
 * re-import. This serves a stable URL the calendar app can poll, so updates flow
 * through on their own.
 *
 * Security: the feed is per-member and contains only that member's events, so the
 * URL is unguessable - a member id plus an HMAC signed with a server secret. The
 * secret is generated once and kept in AppSettings, so it survives restarts and
 * does not need an environment variable.
 */

import crypto from 'crypto';
import { db, zite } from './db/index.js';
import { ids } from '../src/lib/server.js';
import { buildIcs } from '../src/lib/icsBuild.js';

const SETTING = 'calendarSecret';
let cached: string | null = null;

async function secret(): Promise<string> {
  if (cached) return cached;
  const { rows } = await db().query<{ value: string }>(`SELECT "value" FROM "AppSettings" WHERE "key" = $1`, [SETTING]);
  if (rows[0]?.value) {
    cached = rows[0].value;
    return cached;
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  await db().query(
    `INSERT INTO "AppSettings" ("key","value") VALUES ($1,$2) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"`,
    [SETTING, fresh]
  );
  cached = fresh;
  console.log('[calendar] generated and stored a new feed secret');
  return fresh;
}

const sign = (memberId: string, s: string) =>
  crypto.createHmac('sha256', s).update(memberId).digest('hex').slice(0, 32);

/** A stable, unguessable token for a member's feed. */
export async function calendarToken(memberId: string): Promise<string> {
  const s = await secret();
  return `${memberId}.${sign(memberId, s)}`;
}

/** The member id a token belongs to, or null if it is forged. */
export async function verifyCalendarToken(token: string): Promise<string | null> {
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const memberId = token.slice(0, i);
  const provided = token.slice(i + 1);
  const expected = sign(memberId, await secret());
  // Constant-time compare; lengths are equal by construction.
  if (provided.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? memberId : null;
}

/**
 * The .ics body for one member: every non-hidden event they are involved in -
 * the shows they answered Yes or Maybe to, anything they have an attendance row
 * for, and club sessions (which everyone is invited to).
 */
export async function buildMemberFeed(memberId: string): Promise<string> {
  const [shows, subs, resps, att] = await Promise.all([
    zite.shows.findAll({ limit: 500 }),
    zite.subEvents.findAll({ limit: 2000 }),
    zite.showResponses.findAll({ filters: { member: memberId }, limit: 2000 }),
    zite.attendance.findAll({ filters: { member: memberId }, limit: 2000 }),
  ]);

  const showName = (id: string) => shows.records.find((s) => s.id === id)?.showName ?? '';
  const interestedShows = new Set(
    resps.records.filter((r) => ['Yes', 'Maybe'].includes(r.response ?? '')).map((r) => ids(r.show)[0] ?? '')
  );
  const attendedEvents = new Set(att.records.map((a) => ids(a.subEvent)[0] ?? ''));

  const events = subs.records
    .filter((e) => {
      if (e.hidden) return false;
      const showIds = ids(e.shows);
      if (attendedEvents.has(e.id)) return true;
      if (showIds.some((id) => interestedShows.has(id))) return true;
      // Club sessions belong to no show and are open to everyone.
      return showIds.length === 0 && e.type === 'Club Session';
    })
    .map((e) => ({
      id: e.id,
      title: e.title ?? '',
      type: e.type ?? '',
      subtype: e.subtype ?? '',
      date: e.date ?? null,
      dateTbc: !!e.dateTbc,
      meetTime: e.meetTime ?? '',
      // Structured start/end drive the calendar's DTSTART/DTEND: when both
      // are present, the calendar uses them directly instead of falling back
      // to a guess from the meet-time text.
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      showIds: ids(e.shows),
      hidden: !!e.hidden,
    }));

  return buildIcs(events, showName, 'AshTec Crew');
}
