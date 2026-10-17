/**
 * End-to-end smoke test against a RUNNING server.
 *
 * This is the check that actually proves the migration works: it drives the same
 * /api/<name> endpoints the browser calls, over HTTP, with a real session cookie
 * obtained from a real magic link. It deliberately does not import any endpoint
 * module, so it also verifies the router, auth and DB wiring rather than just the
 * business logic.
 *
 * Usage:  npm run smoke              (expects the server on :1502)
 *         BASE_URL=https://... npm run smoke
 *
 * Exits non-zero on the first failed expectation.
 */

import '../server/env.js';
import { db } from '../server/db/index.js';

const BASE = (process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 1502}`).replace(/\/$/, '');

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

type Jar = Map<string, string>;
const jar: Jar = new Map();
const cookieHeader = (j: Jar) => [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function absorb(j: Jar, res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) j.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

/** Signs in over the real magic-link flow, returning a jar holding the cookie. */
async function signIn(schoolEmail: string) {
  const j: Jar = new Map();
  await fetch(`${BASE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: String(schoolEmail).toLowerCase() }),
  });
  const { rows } = await db().query(
    `SELECT "token" FROM "AuthMagicTokens" WHERE "email" = $1 AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [String(schoolEmail).toLowerCase()]
  );
  const t = rows[0]?.token;
  if (!t) return j;
  // The GET only renders a confirmation page (so mail scanners cannot burn the
  // token); redeeming is a POST. Mirror what the page's form does.
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader(j) },
    body: JSON.stringify({ token: t, callbackURL: '/' }),
    redirect: 'manual',
  });
  absorb(j, res);
  return j;
}

async function callAs(j: Jar, name: string, input: unknown = {}) {
  const res = await fetch(`${BASE}/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(j.size ? { cookie: cookieHeader(j) } : {}) },
    body: JSON.stringify(input),
  });
  absorb(j, res);
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

async function call(name: string, input: unknown = {}, expectStatus = 200) {
  const res = await fetch(`${BASE}/api/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jar.size ? { cookie: cookieHeader(jar) } : {}) },
    body: JSON.stringify(input),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, ok: res.status === expectStatus };
}

const get = async (path: string) => {
  const res = await fetch(`${BASE}${path}`, { headers: jar.size ? { cookie: cookieHeader(jar) } : {}, redirect: 'manual' });
  absorb(jar, res);
  return { status: res.status, headers: res.headers, text: await res.text() };
};

console.log(`smoke: ${BASE}\n`);

// ------------------------------------------------------------------ liveness
{
  const res = await get('/healthz');
  const body = JSON.parse(res.text || '{}');
  check('healthz responds 200', res.status === 200);
  check('all endpoints mounted', body.endpoints >= 42, `got ${body.endpoints}`);
  check('database reachable', body.ok === true);
}

// ------------------------------------------------------- auth is enforced
{
  const res = await call('getMe', {}, 401);
  check('unauthenticated getMe is rejected 401', res.status === 401);
}

// ------------------------------------------------------------- static SPA
{
  const res = await get('/');
  check('SPA index served at /', res.status === 200 && res.text.includes('<div id="root"'));
  const deep = await get('/admin/attendance');
  check('deep link /admin/attendance falls through to the SPA', deep.status === 200 && deep.text.includes('<div id="root"'));
}

// -------------------------------------------------------------- magic link
// Mint throwaway accounts rather than signing in as a real crew member. Sign-in
// goes by emailed magic link and the suite also calls adminSendMessage, so
// reusing a real address would mail actual students every time it ran. Both use
// example.com, which is reserved by RFC 2606 and has no MX record, so nothing is
// ever delivered to a person.
const ADMIN_EMAIL = 'smoke-admin@example.com';
const CREW_EMAIL = 'smoke-crew@example.com';

for (const email of [ADMIN_EMAIL, CREW_EMAIL]) {
  await db().query(`DELETE FROM "CrewMembers" WHERE "schoolEmail" = $1`, [email]);
}

const { rows: adminRows } = await db().query(
  `INSERT INTO "CrewMembers" ("id", "schoolEmail", "firstName", "lastName", "year", "isAdmin", "memberType", "roles", "isPreviewAccount")
   VALUES (gen_random_uuid(), $1, 'Smoke', 'Admin', 'Staff', true, 'Teacher', ARRAY['Stage Manager'], false)
   RETURNING "id", "schoolEmail", "firstName"`,
  [ADMIN_EMAIL]
);
const admin = adminRows[0];

await db().query(
  `INSERT INTO "CrewMembers" ("id", "schoolEmail", "firstName", "lastName", "year", "isAdmin", "memberType", "roles", "isPreviewAccount")
   VALUES (gen_random_uuid(), $1, 'Smoke', 'Crew', 'Year 12', false, 'Normal Member', ARRAY['Lighting'], false)`,
  [CREW_EMAIL]
);

if (!admin) {
  console.log('  FAIL could not create the temporary admin crew member');
  failures.push('no admin crew member');
} else {
  // Requesting a link for an address that is not on the crew list must look
  // identical to success and must not create a token, so this route cannot be
  // used to enumerate the crew. (checkEmail is the endpoint that does reveal it.)
  const stranger = await fetch(`${BASE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com' }),
  });
  const strangerBody = JSON.parse((await stranger.text()) || '{}');
  check('magic link for an unknown address returns ok:true', stranger.status === 200 && strangerBody.ok === true);
  const { rows: leaked } = await db().query(`SELECT count(*)::int AS n FROM "AuthMagicTokens" WHERE "email" = 'nobody@example.com'`);
  check('no token created for an unknown address', leaked[0].n === 0);

  const requested = await fetch(`${BASE}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: admin.schoolEmail, name: admin.firstName, callbackURL: '/' }),
  });
  check('magic link requested for a real admin', requested.status === 200);

  const { rows: tokenRows } = await db().query(
    `SELECT "token" FROM "AuthMagicTokens" WHERE "email" = $1 AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [String(admin.schoolEmail).toLowerCase()]
  );
  const token = tokenRows[0]?.token;
  check('a single-use token was stored', Boolean(token));

  if (token) {
    const bad = await get('/api/auth/verify?token=not-a-real-token');
    check('bogus token is refused', bad.status === 400);

    // The GET must NOT consume the token: the school mail gateway prefetches
    // links to scan them, which used to burn the token before the human clicked.
    const confirm = await get(`/api/auth/verify?token=${encodeURIComponent(token)}&callbackURL=%2F`);
    check('link GET renders a confirmation page', confirm.status === 200 && confirm.text.includes('<!doctype html'));
    const { rows: stillThere } = await db().query(
      `SELECT "usedAt" IS NULL AS unused FROM "AuthMagicTokens" WHERE "token" = $1`,
      [token]
    );
    check('link GET does not consume the token', stillThere[0]?.unused === true);

    // Redeeming is a POST, mirroring the form the confirmation page submits.
    const redeem = async (t: string) =>
      fetch(`${BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
        body: JSON.stringify({ token: t, callbackURL: '/' }),
        redirect: 'manual',
      });
    const verified = await redeem(token);
    absorb(jar, verified);
    check('valid token redirects to the callback', verified.status === 303 && verified.headers.get('location') === '/');

    // Replay must fail: the link is single use.
    const replay = await redeem(token);
    check('token cannot be replayed', replay.status === 400);

    const session = await get('/api/auth/session');
    const me = JSON.parse(session.text || '{}');
    check('session cookie authenticates', me.user?.email === String(admin.schoolEmail).toLowerCase(), JSON.stringify(me));

    // ------------------------------------------------ authenticated endpoints
    const gotMe = await call('getMe', {});
    check('getMe returns the signed-in member', gotMe.status === 200 && gotMe.body?.member?.email === String(admin.schoolEmail).toLowerCase(), JSON.stringify(gotMe.body).slice(0, 200));
    check('getMe maps isAdmin/isStaff/roles', gotMe.body?.member?.isAdmin === true && Array.isArray(gotMe.body?.member?.roles));

    const data = await call('adminGetData', {});
    check('adminGetData returns members/shows/events', data.status === 200 && Array.isArray(data.body?.members) && Array.isArray(data.body?.subEvents) && Array.isArray(data.body?.shows));
    // The suite's own throwaway accounts are on the crew list too, so exclude
    // them rather than letting the count drift with the fixtures.
    const migrated = (data.body?.members ?? []).filter(
      (m: any) => !/@example\.com$/i.test(String(m?.email ?? m?.schoolEmail ?? ''))
    );
    check('adminGetData sees the migrated rows', migrated.length === 18 && data.body?.subEvents?.length === 21 && data.body?.shows?.length === 5, `members=${migrated.length} subs=${data.body?.subEvents?.length} shows=${data.body?.shows?.length}`);
    check('adminGetData maps linked ids off responses/attendance', Array.isArray(data.body?.responses) && Array.isArray(data.body?.attendance));

    const cal = await call('getCalendar', {});
    check('getCalendar responds', cal.status === 200);

    const pres = await call('getPresence', {});
    check('getPresence responds', pres.status === 200);

    // --------------------------------------------------------- QR statuses
    const invalid = await call('presenceApproval', { token: 'nope' });
    check('QR: unknown token -> invalid', invalid.status === 200 && invalid.body?.status === 'invalid', JSON.stringify(invalid.body));

    const { rows: sess } = await db().query(`SELECT "id", "status" FROM "PresenceSessions" ORDER BY "startedAt" DESC LIMIT 1`);
    const sessionRow = sess[0];
    check('migrated at least one presence session', Boolean(sessionRow), 'none found');

    // Every migrated session is Ended and all 4 Venue Presence states are blank,
    // so there is no real approval token to scan. Seed one against a real member
    // and the Ended session to exercise the path the old live app used to 500 on:
    // a valid token with no active session must report `closed`, not throw.
    const { rows: endedRows } = await db().query(`SELECT "id" FROM "PresenceSessions" WHERE "status" = 'Ended' ORDER BY "startedAt" DESC LIMIT 1`);
    const endedSession = endedRows[0]?.id;
    const { rows: memberRows2 } = await db().query(`SELECT "id" FROM "CrewMembers" WHERE "isAdmin" = true LIMIT 1`);
    if (endedSession && memberRows2[0]) {
      const token = `smoke-${Date.now().toString(36)}`;
      await db().query(
        `INSERT INTO "VenuePresence" ("id", "presenceKey", "session", "member", "state", "approvalToken", "pendingAction")
         VALUES (gen_random_uuid(), $1, $2, $3, 'Awaiting Approval', $4, $5)`,
        [`${endedSession}:${memberRows2[0].id}`, endedSession, memberRows2[0].id, token, 'Sign In']
      );
      const closed = await call('presenceApproval', { token });
      check(
        'QR: valid token but session Ended -> closed (200, not 500)',
        closed.status === 200 && closed.body?.status === 'closed',
        JSON.stringify(closed.body)
      );
      await db().query('DELETE FROM "VenuePresence" WHERE "approvalToken" = $1', [token]);
    } else {
      check('QR: an Ended session and admin exist to test against', false, 'setup rows missing');
    }

    // ------------------------------------------------------- write paths
    // These matter most: the adapter has to mint ids itself (the schema has no
    // column default) and the two bulkCreate(matchOn) upserts depend on the
    // partial unique indexes existing. A read-only smoke test would miss both.
    const { rows: subRows } = await db().query(`SELECT "id" FROM "SubEvents" ORDER BY "date" LIMIT 1`);
    const { rows: showRows2 } = await db().query(`SELECT "id" FROM "Shows" ORDER BY "showName" LIMIT 1`);
    const subId = subRows[0]?.id;
    const showId = showRows2[0]?.id;
    // Snapshot the row counts up front: the write-path block below fires
    // syncAutoAttendance on each setShowResponse, which is expected to leave
    // the database identical to how it found it (every change rolls back in
    // the cleanup below). Comparing to a fixed expected count is brittle; a
    // dynamic snapshot captures the right baseline for a database that has
    // already been migrated.
    const { rows: preTotal } = await db().query(
      `SELECT (SELECT count(*)::int FROM "Attendance") AS a, (SELECT count(*)::int FROM "ShowResponses") AS r`,
    );
    const memberId = admin.id;

    // Snapshot whatever the import already had, so cleanup restores rather than
    // deletes: setShowResponse upserts, and blindly deleting would drop a real
    // imported response.
    const { rows: preResp } = await db().query(
      `SELECT "response" FROM "ShowResponses" WHERE "member" = $1 AND "show" = $2`, [memberId, showId]);
    const { rows: preAtt } = await db().query(
      `SELECT "status", "reason" FROM "Attendance" WHERE "member" = $1 AND "subEvent" = $2`, [memberId, subId]);
    // syncAutoAttendance fires on every setShowResponse and now also fills in
    // pending rows for sub-events the member hasn't responded to explicitly.
    // Snapshot every attendance row for the member so cleanup can roll those
    // back too, instead of leaving the count drifted upward after the run.
    const { rows: preAttAll } = await db().query(
      `SELECT "id", "subEvent", "status", "reason" FROM "Attendance" WHERE "member" = $1`, [memberId]);
    // submitSupport notifies every admin, which writes EmailLog rows too, so
    // snapshot the ids and remove anything the run adds.
    const { rows: preLog } = await db().query(`SELECT "id" FROM "EmailLog"`);
    const keepLogIds = preLog.map((r) => r.id);
    const preResponse = preResp[0]?.response ?? null;
    const preStatus = preAtt[0]?.status ?? null;
    const preReason = preAtt[0]?.reason ?? null;
    const preAttAllBySub = new Map(preAttAll.map((r) => [String(r.subEvent), { id: String(r.id), status: String(r.status), reason: String(r.reason) }]));
    const preAttAllIds = new Set(preAttAll.map((r) => String(r.id)));

    if (subId && showId) {
      // setShowResponse -> bulkCreate upsert on ShowResponses_responseKey.
      const resp = await call('setShowResponse', { showId, response: 'Yes', memberId });
      check('setShowResponse writes (upsert path)', resp.status === 200 && resp.body?.success === true, JSON.stringify(resp.body));
      const { rows: rr } = await db().query(`SELECT "response" FROM "ShowResponses" WHERE "member" = $1 AND "show" = $2`, [memberId, showId]);
      check('show response row present', rr.length === 1 && rr[0].response === 'Yes');

      // Second identical call must upsert, not duplicate or throw on the index.
      const again = await call('setShowResponse', { showId, response: 'Maybe', memberId });
      const { rows: rr2 } = await db().query(`SELECT "response" FROM "ShowResponses" WHERE "member" = $1 AND "show" = $2`, [memberId, showId]);
      check('repeating setShowResponse upserts instead of duplicating', again.status === 200 && rr2.length === 1 && rr2[0].response === 'Maybe', `rows=${rr2.length}`);

      // setAttendance -> bulkCreate upsert on Attendance_attendanceKey.
      const att = await call('setAttendance', { memberId, items: [{ subEventId: subId, status: 'Expected Arrival', reason: 'smoke test' }] });
      check('setAttendance writes (upsert path)', att.status === 200, JSON.stringify(att.body));
      const { rows: ar } = await db().query(`SELECT "status" FROM "Attendance" WHERE "member" = $1 AND "subEvent" = $2`, [memberId, subId]);
      check('attendance row present', ar.length === 1 && ar[0].status === 'Expected Arrival');

      // updateMyProfile -> update path.
      const origName = admin.firstName;
      const prof = await call('updateMyProfile', { firstName: 'Smoke Test' });
      check('updateMyProfile updates in place', prof.status === 200, JSON.stringify(prof.body).slice(0, 160));
      const { rows: pr } = await db().query(`SELECT "firstName" FROM "CrewMembers" WHERE "id" = $1`, [memberId]);
      check('profile change persisted', pr[0]?.firstName === 'Smoke Test');
      await call('updateMyProfile', { firstName: origName });

      // Batch 1 profile extras: status, birthday, contact-sheet opt-in and the
      // mentor lookup all round-trip through updateMyProfile/getMe.
      const bits = await call('updateMyProfile', { statusText: 'On lighting desk', statusEmoji: '🎧', birthday: '03-14', contactShare: true, contactPhone: '07700 900123' });
      check('updateMyProfile accepts status/birthday/contact', bits.status === 200, JSON.stringify(bits.body).slice(0, 160));
      const meBits = await call('getMe', {});
      const bm = meBits.body?.member ?? {};
      check('profile extras read back', bm.statusText === 'On lighting desk' && bm.statusEmoji === '🎧' && bm.birthday === '03-14' && bm.contactShare === true, JSON.stringify(bm).slice(0, 200));
      const badBd = await call('updateMyProfile', { birthday: '13-45' });
      check('birthday must be MM-DD', badBd.status !== 200);
      const contacts = await call('getContacts', {});
      check('getContacts lists the opt-in', contacts.status === 200 && (contacts.body?.contacts ?? []).some((c: { id: string }) => c.id === memberId), JSON.stringify(contacts.body).slice(0, 160));
      const bdays = await call('getBirthdays', { days: 30 });
      check('getBirthdays is members-only and shaped', bdays.status === 200 && Array.isArray(bdays.body?.birthdays));
      // Leaderboard: every member gets a row, ranks are 1-based, badges catalog
      // comes back, and the caller's own row is included.
      const lb = await call('getLeaderboard', {});
      const lbRows = lb.body?.rows ?? [];
      check('getLeaderboard returns ranked rows', lb.status === 200 && lbRows.length >= 1 && lbRows[0].rank === 1 && typeof lbRows[0].hours === 'number', JSON.stringify(lb.body).slice(0, 160));
      check('getLeaderboard includes the caller and a badge catalog', !!lb.body?.me && Array.isArray(lb.body?.badges) && lb.body.badges.length > 0);
      check('getLeaderboard ranks are dense and ascending', lbRows.every((r: { rank: number }, i: number) => r.rank === i + 1));
      const lbUnauth = await fetch(`${BASE}/api/getLeaderboard`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      check('getLeaderboard requires a session', lbUnauth.status === 401);
      // Restore the row so repeated runs do not leave a status on the admin.
      await call('updateMyProfile', { statusText: '', statusEmoji: '', birthday: '', contactShare: false, contactPhone: '' });

      // -------------------------------------------- Batch 3: show workspace
      // The whole show workspace round-trips through the members-only endpoints:
      // checklist, cue sheet, props, scenes, notes, timings, then the per-event
      // roll call, sign-off, cue call and cover request. Everything created here
      // is deleted again below so repeated runs stay idempotent.
      {
        const wsUnauth = await fetch(`${BASE}/api/getShowWorkspace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ showId }) });
        check('show workspace requires a session', wsUnauth.status === 401);

        const ws = await call('getShowWorkspace', { showId });
        check('getShowWorkspace returns the show and lists', ws.status === 200 && ws.body?.show?.id === showId && Array.isArray(ws.body?.checklist) && Array.isArray(ws.body?.scenes), JSON.stringify(ws.body).slice(0, 160));

        const item = await call('saveChecklistItem', { showId, label: 'Smoke test item', category: 'Props' });
        check('saveChecklistItem creates', item.status === 200 && typeof item.body?.id === 'string');
        const itemId = item.body?.id;
        const ticked = await call('saveChecklistItem', { showId, id: itemId, done: true });
        check('checklist item ticks off', ticked.status === 200);
        const ws2 = await call('getShowWorkspace', { showId });
        check('ticked item reads back as done', (ws2.body?.checklist ?? []).some((c: any) => c.id === itemId && c.done === true));

        const cue = await call('saveCue', { showId, number: 'Q1', department: 'Lighting', description: 'Smoke cue' });
        check('saveCue creates', cue.status === 200 && typeof cue.body?.id === 'string');
        const cueId = cue.body?.id;

        const prop = await call('saveProp', { showId, name: 'Smoke sword', category: 'Prop', holder: memberId });
        check('saveProp creates with a holder', prop.status === 200 && typeof prop.body?.id === 'string');
        const propId = prop.body?.id;

        const scene = await call('saveShowScene', { showId, label: 'S1', title: 'Smoke scene', cast: ['Smoke Admin', 'Smoke Crew'] });
        check('saveShowScene creates', scene.status === 200 && typeof scene.body?.id === 'string');
        const sceneId = scene.body?.id;

        const order = await call('getRehearsalOrder', { showId });
        check('getRehearsalOrder returns an order', order.status === 200 && (order.body?.order ?? []).length >= 1, JSON.stringify(order.body).slice(0, 160));

        const note = await call('saveRehearsalNote', { showId, scene: 'S1', body: 'Smoke note' });
        check('saveRehearsalNote creates', note.status === 200 && typeof note.body?.id === 'string');
        const noteId = note.body?.id;

        const timing = await call('saveSceneTiming', { showId, scene: 'S1', minutes: 12 });
        check('saveSceneTiming creates', timing.status === 200 && typeof timing.body?.id === 'string');
        const timingId = timing.body?.id;

        const roll = await call('rollCall', { subEventId: subId, memberIds: [memberId] });
        check('rollCall records who is present', roll.status === 200 && roll.body?.present >= 1, JSON.stringify(roll.body));

        const sign = await call('signOffShow', { subEventId: subId, role: 'Lighting' });
        check('signOffShow signs off', sign.status === 200 && sign.body?.signed === true);
        const unsign = await call('signOffShow', { subEventId: subId, remove: true });
        check('signOffShow can be undone', unsign.status === 200 && unsign.body?.signed === false);

        const cc = await call('sendCueCall', { subEventId: subId, memberIds: [memberId], message: 'Standby LX' });
        check('sendCueCall sends', cc.status === 200 && cc.body?.sent === 1, JSON.stringify(cc.body));
        const callRow = (await db().query(`SELECT "id" FROM "CueCalls" WHERE "member" = $1 AND "subEvent" = $2 ORDER BY "at" DESC LIMIT 1`, [memberId, subId])).rows[0];
        if (callRow) {
          const ack = await call('ackCueCall', { id: callRow.id });
          check('ackCueCall acknowledges', ack.status === 200 && ack.body?.ok === true);
        }

        const cover = await call('requestCover', { subEventId: subId, role: 'Lighting', reason: 'Smoke test' });
        check('requestCover opens a request', cover.status === 200 && typeof cover.body?.id === 'string');

        const lock = await call('setTechLock', { showId, locked: true });
        check('setTechLock locks (admin)', lock.status === 200 && lock.body?.locked === true);
        const unlock = await call('setTechLock', { showId, locked: false });
        check('setTechLock unlocks again', unlock.status === 200 && unlock.body?.locked === false);

        // Tidy up everything the workspace block created.
        for (const [table, id] of [['ShowChecklistItems', itemId], ['ShowCues', cueId], ['ShowProps', propId], ['ShowScenes', sceneId], ['RehearsalNotes', noteId], ['SceneTimings', timingId]] as const) {
          if (id) await db().query(`DELETE FROM "${table}" WHERE "id" = $1`, [id]);
        }
        await db().query(`DELETE FROM "RollCalls" WHERE "subEvent" = $1 AND "member" = $2`, [subId, memberId]);
        await db().query(`DELETE FROM "ShowSignoffs" WHERE "subEvent" = $1 AND "member" = $2`, [subId, memberId]);
        await db().query(`DELETE FROM "CueCalls" WHERE "subEvent" = $1 AND "member" = $2`, [subId, memberId]);
        await db().query(`DELETE FROM "CoverRequests" WHERE "subEvent" = $1 AND "member" = $2`, [subId, memberId]);
        await db().query(`UPDATE "Shows" SET "techLocked" = false, "techLockedAt" = NULL, "techLockedBy" = NULL WHERE "id" = $1`, [showId]);
        const { rows: wsLeft } = await db().query(
          `SELECT (SELECT count(*)::int FROM "ShowChecklistItems" WHERE "label" = 'Smoke test item') AS c,
                  (SELECT count(*)::int FROM "CueCalls" WHERE "member" = $1) AS cc`, [memberId]);
        check('workspace cleanup left nothing behind', wsLeft[0].c === 0 && wsLeft[0].cc === 0, `c=${wsLeft[0].c} cc=${wsLeft[0].cc}`);
      }

      // -------------------------------------------- Batch 4: show-day extras
      {
        const media = await call('getShowMedia', { showId });
        check('getShowMedia returns the show-day lists', media.status === 200 && media.body?.showId === showId && Array.isArray(media.body?.photos) && Array.isArray(media.body?.lost), JSON.stringify(media.body).slice(0, 160));

        const photo = await call('saveShowPhoto', { showId, url: 'https://example.com/smoke.jpg', caption: 'Smoke shot' });
        check('saveShowPhoto stores a URL', photo.status === 200 && typeof photo.body?.id === 'string', JSON.stringify(photo.body));
        const badPhoto = await call('saveShowPhoto', { showId, url: 'not-a-url' });
        check('saveShowPhoto rejects a non-URL', badPhoto.status >= 400);

        const deb = await call('saveDebrief', { showId, body: 'Smoke debrief' });
        check('saveDebrief records', deb.status === 200 && typeof deb.body?.id === 'string');

        const green = await call('saveGreenRoomNote', { showId, title: 'Smoke call', body: 'Be ready', pinned: true });
        check('saveGreenRoomNote posts', green.status === 200 && typeof green.body?.id === 'string');

        const lost = await call('saveLostItem', { showId, item: 'Smoke sword', location: 'Wings' });
        check('saveLostItem logs', lost.status === 200 && typeof lost.body?.id === 'string');
        const found = await call('saveLostItem', { showId, id: lost.body?.id, status: 'Found', holder: memberId });
        check('lost item updates to Found', found.status === 200);

        const aud = await call('saveAudienceCount', { showId, subEventId: subId, count: 120, capacity: 150 });
        check('saveAudienceCount records', aud.status === 200 && typeof aud.body?.id === 'string');
        const aud2 = await call('saveAudienceCount', { showId, subEventId: subId, count: 130 });
        check('audience count updates in place', aud2.status === 200 && aud2.body?.id === aud.body?.id);

        const cd = await call('getCountdown', {});
        check('getCountdown answers', cd.status === 200 && 'countdown' in (cd.body ?? {}), JSON.stringify(cd.body).slice(0, 160));

        const media2 = await call('getShowMedia', { showId });
        check('show-day lists read back', (media2.body?.photos ?? []).some((p: any) => p.caption === 'Smoke shot') && (media2.body?.audience ?? []).some((a: any) => a.count === 130 && a.capacity === 150));

        await db().query(`DELETE FROM "ShowPhotos" WHERE "url" = 'https://example.com/smoke.jpg'`);
        await db().query(`DELETE FROM "ShowDebriefs" WHERE "body" = 'Smoke debrief'`);
        await db().query(`DELETE FROM "GreenRoomNotes" WHERE "title" = 'Smoke call'`);
        await db().query(`DELETE FROM "LostProperty" WHERE "item" = 'Smoke sword'`);
        await db().query(`DELETE FROM "AudienceCounts" WHERE "subEvent" = $1`, [subId]);
        const { rows: mLeft } = await db().query(
          `SELECT (SELECT count(*)::int FROM "ShowPhotos" WHERE "url" = 'https://example.com/smoke.jpg') AS p,
                  (SELECT count(*)::int FROM "AudienceCounts" WHERE "subEvent" = $1) AS a`, [subId]);
        check('show-day cleanup left nothing behind', mLeft[0].p === 0 && mLeft[0].a === 0, `p=${mLeft[0].p} a=${mLeft[0].a}`);
      }

      // submitSupport -> create + Email.send (logged, SMTP unset).
      const ticket = await call('submitSupport', { type: 'General Support', subject: 'Smoke test ticket', message: 'Automated smoke test, safe to ignore.' });
      check('submitSupport creates a ticket', ticket.status === 200 && typeof ticket.body?.id === 'string', JSON.stringify(ticket.body));
      const ticketId = ticket.body?.id;

      // Ticket 636bde75: pinning floats a ticket to the top of the admin queue.
      if (ticketId) {
        const pin = await call('adminUpdateTicket', { id: ticketId, pinned: true });
        check('adminUpdateTicket pins a ticket', pin.status === 200, JSON.stringify(pin.body).slice(0, 160));
        const sup = await call('adminGetSupport', {});
        const row = (sup.body?.tickets ?? []).find((t: { id: string }) => t.id === ticketId);
        check('adminGetSupport reports the ticket as pinned', !!row && row.pinned === true, JSON.stringify(row).slice(0, 160));
        const unpin = await call('adminUpdateTicket', { id: ticketId, pinned: false });
        check('adminUpdateTicket unpins a ticket', unpin.status === 200, JSON.stringify(unpin.body).slice(0, 160));
      }

      // Ticket 3ead37f8: a badge granted by hand shows on the member's board and
      // can be revoked cleanly, leaving no rows behind.
      const grant = await call('adminSetBadge', { memberId, badgeId: 'first-event', value: true });
      check('adminSetBadge grants a manual badge', grant.status === 200 && grant.body?.success === true, JSON.stringify(grant.body));
      const mb = await call('adminGetMemberBadges', { memberId });
      check('adminGetMemberBadges lists the grant', (mb.body?.granted ?? []).includes('first-event'), JSON.stringify(mb.body));
      const lbGrant = await call('getLeaderboard', {});
      const grantRow = (lbGrant.body?.rows ?? []).find((r: { id: string }) => r.id === memberId);
      check('getLeaderboard includes the manual badge', (grantRow?.badgeIds ?? []).includes('first-event'), JSON.stringify(grantRow?.badgeIds));
      const revoke = await call('adminSetBadge', { memberId, badgeId: 'first-event', value: false });
      check('adminSetBadge revokes the manual badge', revoke.status === 200, JSON.stringify(revoke.body));
      const { rows: mbLeft } = await db().query(`SELECT count(*)::int AS n FROM "MemberBadges" WHERE "member" = $1`, [memberId]);
      check('manual badge left no rows behind', mbLeft[0].n === 0, `n=${mbLeft[0].n}`);

      if (ticketId) await db().query('DELETE FROM "SupportReplies" WHERE "ticket" = $1', [ticketId]);
      if (ticketId) await db().query('DELETE FROM "SupportTickets" WHERE "id" = $1', [ticketId]);

      // adminSendMessage -> bulkCreate over EmailLog.
      const msg = await call('adminSendMessage', { memberIds: [memberId], subject: 'Smoke test message', message: 'Automated smoke test, safe to ignore.' });
      check('adminSendMessage sends and logs', msg.status === 200 && msg.body?.sent === 1, JSON.stringify(msg.body));
      const { rows: el } = await db().query(`SELECT count(*)::int AS n FROM "EmailLog" WHERE "subject" LIKE 'Smoke test message%'`);
      check('email log row written by bulkCreate', el[0].n >= 1, `n=${el[0].n}`);

      // Clean up so repeated smoke runs stay idempotent.
      if (preResponse !== null) {
        await db().query('UPDATE "ShowResponses" SET "response" = $1 WHERE "member" = $2 AND "show" = $3', [preResponse, memberId, showId]);
      } else {
        await db().query('DELETE FROM "ShowResponses" WHERE "member" = $1 AND "show" = $2', [memberId, showId]);
      }
      if (preStatus !== null) {
        await db().query('UPDATE "Attendance" SET "status" = $1, "reason" = $2 WHERE "member" = $3 AND "subEvent" = $4', [preStatus, preReason, memberId, subId]);
      } else {
        await db().query('DELETE FROM "Attendance" WHERE "member" = $1 AND "subEvent" = $2', [memberId, subId]);
      }
      // Roll back any attendance rows that syncAutoAttendance added during the
      // run: anything pre-existing goes back to its snapshot, anything new is
      // deleted. Otherwise the count of Attendance rows would creep up every
      // time the smoke suite ran.
      const { rows: postAttAll } = await db().query(
        `SELECT "id", "subEvent", "status", "reason" FROM "Attendance" WHERE "member" = $1`, [memberId]);
      for (const r of postAttAll) {
        const id = String(r.id);
        const subId2 = String(r.subEvent);
        if (preAttAllIds.has(id) && preAttAllBySub.has(subId2)) {
          const before = preAttAllBySub.get(subId2)!;
          if (before.status !== r.status || before.reason !== r.reason) {
            await db().query('UPDATE "Attendance" SET "status" = $1, "reason" = $2 WHERE "id" = $3',
              [before.status, before.reason, id]);
          }
        } else if (!preAttAllIds.has(id)) {
          await db().query('DELETE FROM "Attendance" WHERE "id" = $1', [id]);
        }
      }
      await db().query(`DELETE FROM "EmailLog" WHERE NOT ("id" = ANY($1::uuid[]))`, [keepLogIds]);
      const { rows: logLeft } = await db().query(`SELECT count(*)::int AS n FROM "EmailLog"`);
      check('no stray email log rows left behind', logLeft[0].n === keepLogIds.length, `left=${logLeft[0].n} expected=${keepLogIds.length}`);
      const { rows: after2 } = await db().query(
        `SELECT (SELECT count(*)::int FROM "Attendance") AS a, (SELECT count(*)::int FROM "ShowResponses") AS r`)
      check('cleanup restored original row counts', after2[0].a === preTotal[0].a && after2[0].r === preTotal[0].r, `attendance=${after2[0].a} responses=${after2[0].r}`);
    } else {
      check('found a sub event and show to write against', false, 'seed data missing');
    }

    // ------------------------------------------------------- feedback form
    // The /feedback/:formId flow: a member answers once and cannot change it,
    // an admin can then read the answers, and a non-admin cannot. Uses the
    // throwaway crew account; the answer is deleted afterwards.
    {
      const { rows: fbCrew } = await db().query(
        `SELECT "id", "schoolEmail" FROM "CrewMembers" WHERE "schoolEmail" = $1`, [CREW_EMAIL]);
      const crew = fbCrew[0];
      if (!crew) {
        check('found the crew member for the feedback flow', false);
      } else {
        const fbJar = await signIn(String(crew.schoolEmail));
        const before = await callAs(fbJar, 'getMyFeedback', { form: '1' });
        check('getMyFeedback starts as not-responded', before.status === 200 && before.body?.responded === false, JSON.stringify(before.body));
        const empty = await callAs(fbJar, 'submitFeedback', { form: '1', selected: [], other: '   ' });
        check('an empty answer is rejected 400', empty.status === 400, `got ${empty.status}`);
        const sent = await callAs(fbJar, 'submitFeedback', { form: '1', selected: ['checklists', 'more-cat'], other: 'Smoke test note.' });
        check('submitFeedback stores an answer', sent.status === 200 && sent.body?.ok === true, JSON.stringify(sent.body));
        const after = await callAs(fbJar, 'getMyFeedback', { form: '1' });
        check('getMyFeedback now reports responded', after.status === 200 && after.body?.responded === true && after.body?.selected?.includes('more-cat'), JSON.stringify(after.body));
        const again = await callAs(fbJar, 'submitFeedback', { form: '1', selected: ['dms'] });
        check('a second answer is refused 409', again.status === 409, `got ${again.status}`);
        const bad = await callAs(fbJar, 'submitFeedback', { form: 'nope', selected: ['dms'] });
        check('an unknown form id is rejected 404', bad.status === 404, `got ${bad.status}`);
        const forbidden = await callAs(fbJar, 'adminGetFeedback', { form: '1' });
        check('a non-admin cannot read all feedback (403)', forbidden.status === 403, `got ${forbidden.status}`);
        const adminView = await call('adminGetFeedback', { form: '1' });
        check('adminGetFeedback lists the answer', adminView.status === 200 && adminView.body?.responses?.some((r: any) => r.memberId === crew.id), JSON.stringify(adminView.body?.responses?.length));
      }
    }
    await db().query('DELETE FROM "FeedbackResponses" WHERE "memberEmail" = $1', [CREW_EMAIL]);

    // ------------------------------------------ QR: ready / not_admin / roster
    // Drives the real approval flow: an admin opens a session, an ordinary crew
    // member asks to sign in, and each side scans the resulting QR code. This
    // also covers presenceStart/presenceEnd/presenceRequest, the last write
    // endpoints the suite was not touching.
    //
    // The crew member is the temporary example.com one created above, not a real
    // student: signing them in emails a magic link, and presenceRequest mails
    // them too.
    const { rows: crewRows } = await db().query(
      `SELECT "id", "schoolEmail" FROM "CrewMembers" WHERE "schoolEmail" = $1`,
      [CREW_EMAIL]
    );
    const crew = crewRows[0];
    if (!crew || !subId) {
      check('found an ordinary crew member and a sub event for the QR flow', false);
    } else {
      const crewJar = await signIn(String(crew.schoolEmail));
      const crewMe = await callAs(crewJar, 'getMe');
      check('ordinary crew can sign in', crewMe.status === 200 && crewMe.body?.member?.isAdmin === false && crewMe.body?.member?.isStaff === false,
        JSON.stringify(crewMe.body).slice(0, 200));

      // Roster authorization: crew must be refused admin/staff roster data.
      const crewRoster = await callAs(crewJar, 'adminGetPresence', {});
      check('ordinary crew is refused the roster (adminGetPresence)', crewRoster.status >= 400,
        `status=${crewRoster.status}`);

      // Ticket 3ead37f8: granting a badge is admin-only, like every other admin write.
      const crewGrant = await callAs(crewJar, 'adminSetBadge', { memberId, badgeId: 'first-event', value: true });
      check('ordinary crew cannot grant a badge (adminSetBadge)', crewGrant.status === 403, `status=${crewGrant.status}`);

      // Staff-but-not-admin must also be allowed to read the roster. The real
      // data has no such account (the one staff member is an admin), so mint a
      // temporary one, prove the path, then remove it.
      const staffEmail = 'smoke-staff@example.com';
      await db().query(`DELETE FROM "CrewMembers" WHERE "schoolEmail" = $1`, [staffEmail]);
      await db().query(
        `INSERT INTO "CrewMembers" ("id", "schoolEmail", "firstName", "lastName", "year", "isAdmin", "memberType", "roles", "isPreviewAccount")
         VALUES (gen_random_uuid(), $1, 'Smoke', 'Staff', 'Staff', false, 'Teacher', ARRAY['Stage Manager'], false)`,
        [staffEmail]
      );
      const staffJar = await signIn(staffEmail);
      const staffRoster = await callAs(staffJar, 'adminGetPresence', {});
      check('staff (non-admin) is allowed to read the roster', staffRoster.status === 200,
        `status=${staffRoster.status} ${JSON.stringify(staffRoster.body).slice(0, 160)}`);
      check('staff roster reports canManage=false', staffRoster.body?.canManage === false,
        JSON.stringify(staffRoster.body?.canManage));
      const staffMutate = await callAs(staffJar, 'presenceStart', { subEventId: subId });
      check('staff may not open a session (admins only)', staffMutate.status >= 400,
        `status=${staffMutate.status}`);

      const started = await call('presenceStart', { subEventId: subId });
      check('presenceStart opens a session', started.status === 200 && typeof started.body?.sessionId === 'string',
        JSON.stringify(started.body));
      const sessionId = started.body?.sessionId;

      const requested = await callAs(crewJar, 'presenceRequest', { action: 'Sign In' });
      check('member can request check-in and gets a token', requested.status === 200 && typeof requested.body?.token === 'string',
        JSON.stringify(requested.body));
      const qrToken = requested.body?.token;

      if (qrToken && sessionId) {
        const asAdmin = await call('presenceApproval', { token: qrToken });
        check('QR: admin scanning a live request -> ready', asAdmin.status === 200 && asAdmin.body?.status === 'ready',
          JSON.stringify(asAdmin.body).slice(0, 200));
        check('QR: ready payload names the member and the session',
          asAdmin.body?.member?.id === crew.id && asAdmin.body?.session?.id === sessionId,
          JSON.stringify(asAdmin.body?.member) + ' / ' + JSON.stringify(asAdmin.body?.session));

        const asCrew = await callAs(crewJar, 'presenceApproval', { token: qrToken });
        check('QR: the requester scanning their own code -> not_admin',
          asCrew.status === 200 && asCrew.body?.status === 'not_admin',
          `status=${asCrew.status} body=${JSON.stringify(asCrew.body)}`);
      }

      // Approve it, then close the session so the suite leaves no open session.
      if (qrToken) await call('presenceDecision', { token: qrToken, approve: true });
      const ended = await call('presenceEnd', {});
      check('presenceEnd closes the session', ended.status === 200 && typeof ended.body?.endedAt === 'string',
        JSON.stringify(ended.body));

      const stillOpen = await call('presenceApproval', { token: qrToken ?? 'nope' });
      check('QR: request stops resolving once the session closed', stillOpen.status === 200 && stillOpen.body?.status !== 'ready',
        JSON.stringify(stillOpen.body));

      // Clean up the session this block created.
      if (sessionId) {
        await db().query('DELETE FROM "VenuePresence" WHERE "session" = $1', [sessionId]);
        await db().query('DELETE FROM "PresenceSessions" WHERE "id" = $1', [sessionId]);
      }

      // ------------------------------------------------- scheduling (Batch 5)
      // Rotas, availability, exam blackouts, preferences and the parents feed.
      // Exercises the whole Schedule page's endpoints over HTTP with both the
      // admin session (jar) and the ordinary crew session (crewJar).
      // A rota slot only surfaces in getSchedule for an upcoming, visible event,
      // and Club Sessions belong to no show so every member can see one - so mint
      // a throwaway Club Session rather than depending on the imported data.
      const { rows: clubRows } = await db().query(
        `INSERT INTO "SubEvents" ("id", "title", "type", "date", "hidden", "meetTime")
         VALUES (gen_random_uuid(), 'Smoke Club Session', 'Club Session', CURRENT_DATE + 7, false, '18:00')
         RETURNING "id"`
      );
      const rotaSubId = clubRows[0]?.id;
      if (!rotaSubId) {
        check('could create a club session for the scheduling flow', false);
      } else {
        const slot = await call('saveRotaSlot', { subEventId: rotaSubId, role: 'Front of House', capacity: 1 });
        check('admin opens a rota slot', slot.status === 200 && typeof slot.body?.id === 'string', JSON.stringify(slot.body));
        const slotId = slot.body?.id;

        if (slotId) {
          const claim = await callAs(crewJar, 'claimRotaSlot', { slotId });
          check('crew claims the rota slot', claim.status === 200 && claim.body?.signedUp === true && claim.body?.full === true,
            JSON.stringify(claim.body));
          const again = await callAs(crewJar, 'claimRotaSlot', { slotId });
          check('claiming twice is idempotent', again.status === 200 && again.body?.signedUp === true, JSON.stringify(again.body));
          const over = await call('claimRotaSlot', { slotId });
          check('a full slot refuses an extra sign-up', over.status >= 400, `status=${over.status}`);

          const sched = await callAs(crewJar, 'getSchedule', {});
          const mine = sched.body?.rotas?.find((r: any) => r.id === slotId);
          check('getSchedule shows the slot as signed up', sched.status === 200 && mine?.signedUp === true && mine?.taken === 1,
            JSON.stringify(mine));

          const release = await callAs(crewJar, 'claimRotaSlot', { slotId, release: true });
          check('crew releases the slot', release.status === 200 && release.body?.signedUp === false, JSON.stringify(release.body));
        }

        // Availability: add, see it, remove it.
        const addAvail = await callAs(crewJar, 'saveAvailability', { date: '2030-01-15', allDay: true, reason: 'Exams' });
        check('crew adds an unavailable day', addAvail.status === 200 && typeof addAvail.body?.id === 'string', JSON.stringify(addAvail.body));
        const availId = addAvail.body?.id;
        const sched2 = await callAs(crewJar, 'getSchedule', {});
        check('getSchedule lists the unavailable day', sched2.body?.availability?.some((a: any) => a.id === availId && a.reason === 'Exams'));
        if (availId) {
          const del = await callAs(crewJar, 'saveAvailability', { id: availId, remove: true });
          check('crew removes the unavailable day', del.status === 200, JSON.stringify(del.body));
        }

        // Preferences round-trip.
        const pref = await callAs(crewJar, 'saveSchedulePrefs', { travelMinutes: 25 });
        check('crew saves travel time', pref.status === 200, JSON.stringify(pref.body));
        const sched3 = await callAs(crewJar, 'getSchedule', {});
        check('getSchedule reflects the travel time', sched3.body?.travelMinutes === 25, String(sched3.body?.travelMinutes));

        // Blackouts are admin-only, and drive the "Exam period" badge.
        const deniedBlackout = await callAs(crewJar, 'saveBlackout', { label: 'X', startDate: '2030-05-01' });
        check('non-admin cannot set a blackout (403)', deniedBlackout.status === 403, `status=${deniedBlackout.status}`);
        const blackout = await call('saveBlackout', { label: 'GCSEs', startDate: '2030-05-01', endDate: '2030-06-15' });
        check('admin adds an exam blackout', blackout.status === 200 && typeof blackout.body?.id === 'string', JSON.stringify(blackout.body));
        if (blackout.body?.id) {
          const sched4 = await callAs(crewJar, 'getSchedule', {});
          check('getSchedule lists the exam blackout', sched4.body?.blackouts?.some((b: any) => b.label === 'GCSEs'));
          const rm = await call('saveBlackout', { id: blackout.body.id, remove: true });
          check('admin removes the exam blackout', rm.status === 200, JSON.stringify(rm.body));
        }

        // Family feed: the parents URL is public and serves a calendar.
        const feed = await callAs(crewJar, 'getFamilyFeed', {});
        check('getFamilyFeed returns a parents calendar URL',
          feed.status === 200 && typeof feed.body?.parentsUrl === 'string' && feed.body.parentsUrl.endsWith('/parents.ics'),
          JSON.stringify(feed.body));
        const publicIcs = await get('/parents.ics');
        check('the parents feed serves text/calendar', publicIcs.status === 200 && (publicIcs.headers.get('content-type') ?? '').includes('text/calendar'),
          `status=${publicIcs.status} type=${publicIcs.headers.get('content-type')}`);

        // Clean up the slot and the throwaway club session this block created.
        if (slotId) {
          const gone = await call('saveRotaSlot', { id: slotId, remove: true });
          check('admin removes the rota slot', gone.status === 200, JSON.stringify(gone.body));
        }
        await db().query('DELETE FROM "RotaSlots" WHERE "subEvent" = $1', [rotaSubId]);
        await db().query('DELETE FROM "SubEvents" WHERE "id" = $1', [rotaSubId]);
      }

      // ---------------------------------------------- app polish (Batch 6)
      // Push tuning, notification history, data export and the call sheet.
      const prefsMe = await callAs(crewJar, 'getMe', {});
      check('getMe exposes notificationPrefs',
        prefsMe.status === 200 && typeof prefsMe.body?.notificationPrefs === 'object' && prefsMe.body.notificationPrefs !== null,
        JSON.stringify(prefsMe.body?.notificationPrefs));

      const muted = await callAs(crewJar, 'saveNotificationPrefs', { prefs: { 'form-due': false } });
      check('crew can mute a notification kind', muted.status === 200 && muted.body?.prefs?.['form-due'] === false, JSON.stringify(muted.body));
      const prefsAfter = await callAs(crewJar, 'getMe', {});
      check('the mute is reflected in getMe', prefsAfter.body?.notificationPrefs?.['form-due'] === false,
        JSON.stringify(prefsAfter.body?.notificationPrefs));
      const unmuted = await callAs(crewJar, 'saveNotificationPrefs', { prefs: { 'form-due': true } });
      check('crew can un-mute a notification kind', unmuted.status === 200 && unmuted.body?.prefs?.['form-due'] === true, JSON.stringify(unmuted.body));

      const history = await callAs(crewJar, 'getNotificationHistory', {});
      check('getNotificationHistory returns a list', history.status === 200 && Array.isArray(history.body?.items),
        JSON.stringify(history.body).slice(0, 120));

      const dump = await callAs(crewJar, 'exportMyData', {});
      check('exportMyData returns the member profile',
        dump.status === 200 && dump.body?.profile?.email === String(crew.schoolEmail),
        JSON.stringify(dump.body?.profile?.email));

      if (showId) {
        const sheet = await call('getCallSheet', { showId });
        check('getCallSheet returns events for the show',
          sheet.status === 200 && typeof sheet.body?.show?.name === 'string' && Array.isArray(sheet.body?.events),
          JSON.stringify(sheet.body).slice(0, 160));
        const badSheet = await call('getCallSheet', { showId: '00000000-0000-0000-0000-000000000000' });
        check('getCallSheet refuses an unknown show', badSheet.status >= 400, `status=${badSheet.status}`);
      }

      // ---------------------------------------------- crew comms (Batch 7)
      // Announcements, direct messages and the skills directory.
      const anons = await callAs(crewJar, 'getAnnouncements', {});
      check('getAnnouncements returns a list', anons.status === 200 && Array.isArray(anons.body?.items),
        JSON.stringify(anons.body).slice(0, 120));

      const deniedAnon = await callAs(crewJar, 'saveAnnouncement', { title: 'Nope', body: 'Not allowed' });
      check('ordinary crew cannot post an announcement (403)', deniedAnon.status === 403, `status=${deniedAnon.status}`);

      const posted = await call('saveAnnouncement', { title: 'Smoke test', body: 'Automated announcement', pinned: true });
      check('admin posts an announcement', posted.status === 200 && typeof posted.body?.id === 'string',
        JSON.stringify(posted.body).slice(0, 160));

      const pinned = await callAs(crewJar, 'getAnnouncements', {});
      check('the announcement appears pinned first',
        pinned.status === 200 && pinned.body?.items?.[0]?.title === 'Smoke test',
        JSON.stringify(pinned.body?.items?.map?.((a: any) => a.title)).slice(0, 160));

      if (posted.body?.id) {
        const del = await call('saveAnnouncement', { id: posted.body.id, remove: true });
        check('admin deletes the announcement', del.status === 200, JSON.stringify(del.body).slice(0, 120));
      }

      // Direct messages: crew to admin.
      const adminMe = await call('getMe', {});
      const adminId = adminMe.body?.member?.id;
      const dir = await callAs(crewJar, 'getMessageDirectory', {});
      check('getMessageDirectory lists the crew',
        dir.status === 200 && Array.isArray(dir.body?.people) && dir.body.people.length > 0,
        JSON.stringify(dir.body).slice(0, 120));

      const noSelf = await callAs(crewJar, 'sendMessage', { toId: crew.id, body: 'hello me' });
      check('sending a message to yourself is refused', noSelf.status >= 400, `status=${noSelf.status}`);

      if (adminId && adminId !== crew.id) {
        const sent = await callAs(crewJar, 'sendMessage', { toId: adminId, body: 'Smoke test DM' });
        check('crew sends a direct message', sent.status === 200, JSON.stringify(sent.body).slice(0, 120));

        const thread = await callAs(crewJar, 'getThread', { memberId: adminId });
        check('getThread shows the message',
          thread.status === 200 && thread.body?.messages?.some?.((m: any) => m.body === 'Smoke test DM'),
          JSON.stringify(thread.body).slice(0, 160));

        const convs = await callAs(crewJar, 'getConversations', {});
        check('getConversations lists the thread',
          convs.status === 200 && convs.body?.conversations?.some?.((c: any) => c.memberId === adminId),
          JSON.stringify(convs.body).slice(0, 160));

        const reply = await call('sendMessage', { toId: crew.id, body: 'Smoke reply' });
        check('admin replies', reply.status === 200, JSON.stringify(reply.body).slice(0, 120));
        const crewUnread = await callAs(crewJar, 'getMe', {});
        check('getMe reports unread messages', (crewUnread.body?.unreadMessages ?? 0) >= 1,
          String(crewUnread.body?.unreadMessages));

        await db().query(
          'DELETE FROM "DirectMessages" WHERE ("from" = $1 AND "to" = $2) OR ("from" = $2 AND "to" = $1)',
          [crew.id, adminId]
        );
      }

      // Skills directory: save, de-duplicate, list, then reset.
      const skills = await callAs(crewJar, 'getSkillsDirectory', {});
      check('getSkillsDirectory returns people and tags',
        skills.status === 200 && Array.isArray(skills.body?.people) && Array.isArray(skills.body?.tags),
        JSON.stringify(skills.body).slice(0, 120));

      const savedSkills = await callAs(crewJar, 'updateMyProfile', { skillsTeach: 'Lighting, Sound , Lighting', skillsLearn: 'Rigging' });
      check('crew saves skills', savedSkills.status === 200, JSON.stringify(savedSkills.body).slice(0, 120));

      const skillsAfter = await callAs(crewJar, 'getSkillsDirectory', {});
      const meRow = skillsAfter.body?.people?.find?.((p: any) => p.id === crew.id);
      check('the skills directory lists the crew member with de-duplicated tags',
        !!meRow && Array.isArray(meRow.teach) && meRow.teach.length === 2 && meRow.teach.includes('Lighting') && meRow.teach.includes('Sound'),
        JSON.stringify(meRow));

      await callAs(crewJar, 'updateMyProfile', { skillsTeach: '', skillsLearn: '' });

      // ---------------------------------------------- the fun ones (Batch 8)
      // Show memories gathers photos and debrief lines per show.
      const memories = await callAs(crewJar, 'getMemories', {});
      check('getMemories returns a show list',
        memories.status === 200 && Array.isArray(memories.body?.shows),
        JSON.stringify(memories.body).slice(0, 120));
    }

      // ------------------------------------------------------------- logout
    const res = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie: cookieHeader(jar) } });
    check('logout succeeds', res.status === 200);
    jar.clear();
    const after = await call('getMe', {}, 401);
    check('session is gone after logout', after.status === 401);
  }
}

// Leave no auth rows behind either. Scoped to the throwaway accounts on
// purpose: an unscoped DELETE here would sign every real crew member out and
// void their pending magic links the moment anyone ran the suite in production.
const SMOKE_EMAILS = [ADMIN_EMAIL, CREW_EMAIL, 'smoke-staff@example.com'];
for (const email of SMOKE_EMAILS) {
  await db().query(`DELETE FROM "CrewMembers" WHERE "schoolEmail" = $1`, [email]);
}
await db().query(`DELETE FROM "AuthMagicTokens" WHERE "email" = ANY($1)`, [SMOKE_EMAILS]);
await db().query(`DELETE FROM "AuthSessions" WHERE "email" = ANY($1)`, [SMOKE_EMAILS]);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
await db().end();