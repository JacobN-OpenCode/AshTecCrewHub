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
  check('all 35 endpoints mounted', body.endpoints === 35, `got ${body.endpoints}`);
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
    const memberId = admin.id;

    // Snapshot whatever the import already had, so cleanup restores rather than
    // deletes: setShowResponse upserts, and blindly deleting would drop a real
    // imported response.
    const { rows: preResp } = await db().query(
      `SELECT "response" FROM "ShowResponses" WHERE "member" = $1 AND "show" = $2`, [memberId, showId]);
    const { rows: preAtt } = await db().query(
      `SELECT "status", "reason" FROM "Attendance" WHERE "member" = $1 AND "subEvent" = $2`, [memberId, subId]);
    // submitSupport notifies every admin, which writes EmailLog rows too, so
    // snapshot the ids and remove anything the run adds.
    const { rows: preLog } = await db().query(`SELECT "id" FROM "EmailLog"`);
    const keepLogIds = preLog.map((r) => r.id);
    const preResponse = preResp[0]?.response ?? null;
    const preStatus = preAtt[0]?.status ?? null;
    const preReason = preAtt[0]?.reason ?? null;

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

      // submitSupport -> create + Email.send (logged, SMTP unset).
      const ticket = await call('submitSupport', { type: 'General Support', subject: 'Smoke test ticket', message: 'Automated smoke test, safe to ignore.' });
      check('submitSupport creates a ticket', ticket.status === 200 && typeof ticket.body?.id === 'string', JSON.stringify(ticket.body));
      const ticketId = ticket.body?.id;
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
      await db().query(`DELETE FROM "EmailLog" WHERE NOT ("id" = ANY($1::uuid[]))`, [keepLogIds]);
      const { rows: logLeft } = await db().query(`SELECT count(*)::int AS n FROM "EmailLog"`);
      check('no stray email log rows left behind', logLeft[0].n === keepLogIds.length, `left=${logLeft[0].n} expected=${keepLogIds.length}`);
      const { rows: after2 } = await db().query(
        `SELECT (SELECT count(*)::int FROM "Attendance") AS a, (SELECT count(*)::int FROM "ShowResponses") AS r`)
      check('cleanup restored original row counts', after2[0].a === 114 && after2[0].r === 42, `attendance=${after2[0].a} responses=${after2[0].r}`);
    } else {
      check('found a sub event and show to write against', false, 'seed data missing');
    }

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