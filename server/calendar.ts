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
 * Every non-hidden event one member is involved in: the shows they answered Yes
 * or Maybe to, anything they have an attendance row for, and club sessions
 * (which everyone is invited to).
 */
export async function memberEvents(memberId: string) {
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

  return { events, showName };
}

/** The .ics body for one member. */
export async function buildMemberFeed(memberId: string): Promise<string> {
  const { events, showName } = await memberEvents(memberId);
  return buildIcs(events, showName, 'AshTec Crew');
}

/**
 * The next call for one member, as plain data (feedback round 2, round 3).
 *
 * This exists so a watch can show the next call without a native app that needs
 * a paid developer account: an Apple Shortcut running on the Apple Watch, or a
 * tiny sideloaded Wear OS app, can fetch it with the same per-member token the
 * calendar feed uses and render it however it likes.
 */
export async function nextCall(memberId: string) {
  const { events, showName } = await memberEvents(memberId);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => !!e.date && e.date >= today)
    .sort((a, b) => `${a.date} ${a.startTime ?? a.meetTime ?? ''}`.localeCompare(`${b.date} ${b.startTime ?? b.meetTime ?? ''}`));
  const e = upcoming[0];
  if (!e) return null;
  return {
    title: e.title,
    type: e.type,
    subtype: e.subtype,
    show: e.showIds.map(showName).filter(Boolean).join(', '),
    date: e.date,
    dateTbc: e.dateTbc,
    meetTime: e.meetTime,
    startTime: e.startTime,
    endTime: e.endTime,
    // Convenient pre-joined label, e.g. "Tue 4 Nov · 16:30".
    when: e.date
      ? `${new Date(`${e.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${e.startTime ? ` · ${e.startTime}` : e.meetTime ? ` · ${e.meetTime}` : ''}`
      : '',
  };
}

/**
 * The public parents feed (Batch 5). Same events getPublicCalendar publishes -
 * no descriptions, no responses, nothing about individual crew - as a
 * subscribable text/calendar feed. Unauthenticated: it only ever exposes what
 * the parents page already shows.
 */
export async function buildPublicFeed(): Promise<string> {
  const [shows, subs] = await Promise.all([
    zite.shows.findAll({ limit: 500 }),
    zite.subEvents.findAll({ limit: 2000 }),
  ]);
  const visibleShows = new Map(shows.records.filter((s) => !s.hidden).map((s) => [s.id, s.showName ?? '']));
  const showName = (id: string) => visibleShows.get(id) ?? '';
  const events = subs.records
    .filter((e) => !e.hidden)
    .filter((e) => !!e.date && !e.dateTbc)
    .filter((e) => ids(e.shows).some((id) => visibleShows.has(id)))
    .map((e) => ({
      id: e.id,
      title: e.title ?? 'Untitled',
      type: e.type ?? 'Rehearsal',
      subtype: e.subtype ?? '',
      date: e.date as string,
      dateTbc: false,
      meetTime: e.meetTime ?? '',
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      showIds: ids(e.shows),
      hidden: false,
    }));
  return buildIcs(events, showName, 'AshTec Shows');
}
