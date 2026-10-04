/**
 * One-time import of the Zite production export into Postgres.
 *
 *   npm run migrate -- --dir ~/Downloads
 *
 * Idempotent: every row is upserted by its original Zite `id`, so re-running
 * after a schema change is safe and will not duplicate anything.
 *
 * Why this is not a plain column copy: Zite's CSV export writes linked-record
 * columns as their DISPLAY value (a member's school email, a show's name, a
 * ticket's subject) and adds extra rollup columns that have no schema at all.
 * Those are resolved back to ids here, using the `* Key` columns where they
 * exist (they carry real ids) and unique display values where they don't.
 *
 * Every header in the CSV is asserted against the known real columns or the
 * known rollup list, so a column that appears in a future export fails loudly
 * instead of being silently dropped.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db, closeDb } from '../server/db/index.js';
import '../server/env.js';

// ---------------------------------------------------------------------------
// RFC4180 CSV parsing (hand-rolled: quoted fields, "" escapes, embedded
// newlines -- the EmailLog bodies contain both).
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Strip a UTF-8 BOM, which Excel adds and which would corrupt the first header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------
const str = (v: string | undefined): string => (v ?? '').trim();
const bool = (v: string | undefined): boolean => /^true$/i.test(str(v));
const dateOrNull = (v: string | undefined): string | null => (str(v) || null);
/** Zite exports datetimes as ISO-Z; Postgres wants a plain ISO string. */
const tsOrNull = (v: string | undefined): string | null => {
  const s = str(v);
  return s ? new Date(s).toISOString() : null;
};
/** 'Stage Right, Microphone Management' -> ['Stage Right', 'Microphone Management'] */
const list = (v: string | undefined): string[] =>
  str(v).split(',').map((s) => s.trim()).filter(Boolean);
const splitList = (v: string | undefined): string[] =>
  str(v).split(/,\s*/).map((s) => s.trim()).filter(Boolean);

/** Splits 'memberId:subEventId' keys such as AttendanceKey / PresenceKey. */
const keyPair = (v: string): [string, string] => {
  const i = v.indexOf(':');
  return i === -1 ? ['', ''] : [v.slice(0, i), v.slice(i + 1)];
};

// ---------------------------------------------------------------------------
// Table descriptors: real (importable) columns and known rollup columns.
// `dbColumns` maps CSV header -> Postgres column. Anything in `rollups` is
// skipped; anything else in the file is a hard error.
// ---------------------------------------------------------------------------
type Desc = { file: string; rollups: string[]; cols: Record<string, string> };

const D: Record<string, Desc> = {
  CrewMembers: {
    file: 'Crew Members',
    rollups: ['Show Responses', 'Attendance', 'Sessions', 'Email Log', 'Support Tickets', 'Support Replies', 'Assigned Support Tickets', 'Presence Sessions', 'Presence Sessions (1)', 'Venue Presence', 'Venue Presence (1)'],
    cols: {
      ID: 'id', 'School Email': 'schoolEmail', 'First Name': 'firstName', 'Last Name': 'lastName',
      Year: 'year', 'Is Admin': 'isAdmin', 'Member Type': 'memberType', Roles: 'roles',
      'Head Of': 'headOf', 'Preferred Role 1': 'preferredRole1', 'Preferred Role 2': 'preferredRole2',
      'Admin Notes': 'adminNotes', 'Is Maintainer': 'isMaintainer',
      'Is Preview Account': 'isPreviewAccount', 'Alternate Emails': 'alternateEmails',
    },
  },
  Shows: {
    file: 'Shows',
    rollups: ['Sub Events', 'Show Responses', 'Email Log'],
    cols: {
      ID: 'id', 'Show Name': 'showName', 'Short Code': 'shortCode', Description: 'description',
      'Response Due Date': 'responseDueDate', 'Due Date Unknown': 'dueDateUnknown', Hidden: 'hidden',
    },
  },
  SubEvents: {
    file: 'Sub Events',
    rollups: ['Attendance', 'Presence Sessions'],
    cols: {
      ID: 'id', Title: 'title', Type: 'type', Subtype: 'subtype', Shows: 'shows', Date: 'date',
      'Date TBC': 'dateTbc', Description: 'description', 'Meet Time': 'meetTime', Timings: 'timings',
      Importance: 'importance', 'Things To Bring': 'thingsToBring', 'Response Due Date': 'responseDueDate',
      'Due Date Unknown': 'dueDateUnknown', Hidden: 'hidden',
    },
  },
  ShowResponses: {
    file: 'Show Responses',
    rollups: [],
    cols: {
      ID: 'id', 'Response Key': 'responseKey', Member: 'member', Show: 'show',
      Response: 'response', 'Entered By Admin': 'enteredByAdmin',
    },
  },
  Attendance: {
    file: 'Attendance',
    rollups: [],
    cols: {
      ID: 'id', 'Attendance Key': 'attendanceKey', Member: 'member', 'Sub Event': 'subEvent',
      Status: 'status', Reason: 'reason', 'Entered By Admin': 'enteredByAdmin',
    },
  },
  PresenceSessions: {
    file: 'Presence Sessions',
    rollups: ['Venue Presence'],
    cols: {
      ID: 'id', 'Session Key': 'sessionKey', 'Sub Event': 'subEvent', 'Started By': 'startedBy',
      'Started At': 'startedAt', 'Ended At': 'endedAt', 'Ended By': 'endedBy', Status: 'status',
    },
  },
  VenuePresence: {
    file: 'Venue Presence',
    rollups: [],
    cols: {
      ID: 'id', 'Presence Key': 'presenceKey', Session: 'session', Member: 'member', State: 'state',
      'Reason Label': 'reasonLabel', Reason: 'reason', 'Coming Back': 'comingBack',
      'Expected Back At': 'expectedBackAt', 'Signed In At': 'signedInAt', 'Signed Out At': 'signedOutAt',
      'Updated By': 'updatedBy', 'Approval Token': 'approvalToken', 'Pending Action': 'pendingAction',
    },
  },
  SupportTickets: {
    file: 'Support Tickets',
    rollups: ['Support Replies'],
    cols: {
      ID: 'id', Subject: 'subject', Type: 'type', Message: 'message', 'Submitted By': 'submittedBy',
      Status: 'status', 'Admin Notes': 'adminNotes', Page: 'page', 'Submitted At': 'submittedAt',
      'Assigned Maintainers': 'assignedMaintainers', 'Last Reply From': 'lastReplyFrom',
      'Last Reply At': 'lastReplyAt', 'Escalated At': 'escalatedAt', 'Refer to opencode': 'referToOpencode',
    },
  },
  SupportReplies: {
    file: 'Support Replies',
    rollups: [],
    cols: {
      ID: 'id', 'Reply Key': 'replyKey', Ticket: 'ticket', Author: 'author', Kind: 'kind',
      Body: 'body', Recipients: 'recipients', 'Sent At': 'sentAt', 'Email Message Id': 'emailMessageId',
    },
  },
  EmailLog: {
    file: 'Email Log',
    rollups: [],
    cols: {
      ID: 'id', Subject: 'subject', Member: 'member', 'Recipient Email': 'recipientEmail',
      Purpose: 'purpose', Shows: 'shows', Body: 'body', 'Sent By': 'sentBy', 'Sent At': 'sentAt',
      'Batch Id': 'batchId',
    },
  },
};

async function main() {
  // Apply the schema first so `npm run migrate` works against an empty database.
  // The DDL is idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT
  // EXISTS), so this is safe on a database that is already populated.
  {
    const schema = readFileSync(new URL('../server/db/schema.sql', import.meta.url), 'utf8');
    await db().query(schema);
    console.log('  applied server/db/schema.sql');
  }

  const dirArg = process.argv.indexOf('--dir');
  const dir = dirArg !== -1 ? process.argv[dirArg + 1] : join(process.env.HOME!, 'Downloads');

  const find = (prefix: string): string => {
    const hit = readdirSync(dir).find((f) => f.startsWith(`${prefix} - Grid view -`) && f.endsWith('.csv'));
    if (!hit) throw new Error(`Could not find "${prefix} - Grid view -*.csv" in ${dir}`);
    return join(dir, hit);
  };

  const loaded: Record<string, Record<string, string>[]> = {};
  for (const [table, desc] of Object.entries(D)) {
    const rows = parseCsv(readFileSync(find(desc.file), 'utf8'));
    const known = new Set([...Object.keys(desc.cols), ...desc.rollups]);
    const unknown = Object.keys(rows[0] ?? {}).filter((h) => !known.has(h));
    if (unknown.length) {
      throw new Error(`${table}: unexpected column(s) in the export: ${unknown.join(', ')}. Add them to cols (to import) or rollups (to skip) before migrating.`);
    }
    loaded[table] = rows;
    console.log(`  read ${String(rows.length).padStart(4)} rows  ${desc.file}`);
  }

  const pool = db();

  // Lookups for resolving display values back to ids. Rebuilt after each table
  // import, because SubEvents needs Shows, SupportTickets needs CrewMembers,
  // SupportReplies needs SupportTickets, and EmailLog needs both.
  let memberByEmail = new Map<string, string>();
  let showByName = new Map<string, string>();
  let ticketBySubject = new Map<string, string>();
  const loadLookups = async () => {
    const m = await pool.query('SELECT "id", lower("schoolEmail") AS e FROM "CrewMembers"');
    memberByEmail = new Map(m.rows.map((r) => [String(r.e), r.id]));
    const s = await pool.query('SELECT "id", lower("showName") AS n FROM "Shows"');
    showByName = new Map(s.rows.map((r) => [String(r.n), r.id]));
    const t = await pool.query('SELECT "id", "subject" FROM "SupportTickets"');
    ticketBySubject = new Map(t.rows.map((r) => [r.subject, r.id]));
  };
  await loadLookups();

  const unresolved = { member: 0, show: 0, ticket: 0 };
  const emailToId = (e: string): string | null => {
    const v = str(e).toLowerCase();
    if (!v) return null;
    const id = memberByEmail.get(v);
    if (!id) unresolved.member++;
    return id ?? null;
  };
  const nameToId = (n: string): string | null => {
    const v = str(n).toLowerCase();
    if (!v) return null;
    const id = showByName.get(v);
    if (!id) unresolved.show++;
    return id ?? null;
  };
  const subjectToId = (s: string): string | null => {
    const v = str(s);
    if (!v) return null;
    const id = ticketBySubject.get(v);
    if (!id) unresolved.ticket++;
    return id ?? null;
  };

  /** Insert order matters: every link target must exist first. */
  const order: Array<[string, (r: Record<string, string>) => Record<string, any>]> = [
    ['CrewMembers', (r) => ({
      id: str(r.ID), schoolEmail: str(r['School Email']), firstName: str(r['First Name']),
      lastName: str(r['Last Name']), year: str(r.Year), isAdmin: bool(r['Is Admin']),
      memberType: str(r['Member Type']) || 'Normal Member', roles: list(r.Roles), headOf: list(r['Head Of']),
      preferredRole1: str(r['Preferred Role 1']), preferredRole2: str(r['Preferred Role 2']),
      adminNotes: str(r['Admin Notes']), isMaintainer: bool(r['Is Maintainer']),
      isPreviewAccount: bool(r['Is Preview Account']), alternateEmails: str(r['Alternate Emails']),
    })],
    ['Shows', (r) => ({
      id: str(r.ID), showName: str(r['Show Name']), shortCode: str(r['Short Code']),
      description: str(r.Description), responseDueDate: dateOrNull(r['Response Due Date']),
      dueDateUnknown: bool(r['Due Date Unknown']), hidden: bool(r.Hidden),
    })],
    ['SubEvents', (r) => ({
      id: str(r.ID), title: str(r.Title), type: str(r.Type) || 'Rehearsal', subtype: str(r.Subtype),
      shows: splitList(r.Shows).map((n) => nameToId(n)).filter(Boolean),
      date: dateOrNull(r.Date), dateTbc: bool(r['Date TBC']), description: str(r.Description),
      meetTime: str(r['Meet Time']), timings: str(r.Timings),
      importance: str(r.Importance) || 'Medium', thingsToBring: str(r['Things To Bring']),
      responseDueDate: dateOrNull(r['Response Due Date']),
      dueDateUnknown: bool(r['Due Date Unknown']), hidden: bool(r.Hidden),
    })],
    ['ShowResponses', (r) => {
      // ResponseKey is "memberId:showId" -- real ids, so no display lookup needed.
      const [m, s] = keyPair(str(r['Response Key']));
      return {
        id: str(r.ID), responseKey: str(r['Response Key']),
        member: m || emailToId(r.Member), show: s || nameToId(r.Show),
        response: str(r.Response), enteredByAdmin: bool(r['Entered By Admin']),
      };
    }],
    ['Attendance', (r) => {
      // AttendanceKey is "memberId:subEventId".
      const [m, s] = keyPair(str(r['Attendance Key']));
      return {
        id: str(r.ID), attendanceKey: str(r['Attendance Key']),
        member: m || emailToId(r.Member), subEvent: s,
        status: str(r.Status), reason: str(r.Reason), enteredByAdmin: bool(r['Entered By Admin']),
      };
    }],
    ['PresenceSessions', (r) => {
      // SessionKey is "subEventId:startedAt".
      const [sub] = keyPair(str(r['Session Key']));
      return {
        id: str(r.ID), sessionKey: str(r['Session Key']), subEvent: sub,
        startedBy: emailToId(r['Started By']), startedAt: tsOrNull(r['Started At']),
        endedAt: tsOrNull(r['Ended At']), endedBy: emailToId(r['Ended By']),
        status: str(r.Status) || 'Active',
      };
    }],
    ['VenuePresence', (r) => {
      // PresenceKey is "sessionId:memberId".
      const [s, m] = keyPair(str(r['Presence Key']));
      return {
        id: str(r.ID), presenceKey: str(r['Presence Key']),
        session: s, member: m || emailToId(r.Member),
        // Blank state means "never scanned", which the endpoints treat as null.
        state: str(r.State) || null, reasonLabel: str(r['Reason Label']), reason: str(r.Reason),
        comingBack: bool(r['Coming Back']), expectedBackAt: tsOrNull(r['Expected Back At']),
        signedInAt: tsOrNull(r['Signed In At']), signedOutAt: tsOrNull(r['Signed Out At']),
        updatedBy: emailToId(r['Updated By']), approvalToken: str(r['Approval Token']),
        pendingAction: str(r['Pending Action']) || null,
      };
    }],
    ['SupportTickets', (r) => ({
      id: str(r.ID), subject: str(r.Subject), type: str(r.Type), message: str(r.Message),
      submittedBy: emailToId(r['Submitted By']), status: str(r.Status) || 'Open',
      adminNotes: str(r['Admin Notes']), page: str(r.Page), submittedAt: tsOrNull(r['Submitted At']),
      assignedMaintainers: splitList(r['Assigned Maintainers']).map((e) => emailToId(e)).filter(Boolean),
      lastReplyFrom: str(r['Last Reply From']), lastReplyAt: tsOrNull(r['Last Reply At']),
      escalatedAt: tsOrNull(r['Escalated At']), referToOpencode: str(r['Refer to opencode']),
    })],
    ['SupportReplies', (r) => ({
      id: str(r.ID), replyKey: str(r['Reply Key']),
      // Ticket exports as its subject; all 19 production subjects are distinct.
      ticket: subjectToId(r.Ticket), author: emailToId(r.Author),
      kind: str(r.Kind), body: str(r.Body), recipients: str(r.Recipients),
      sentAt: tsOrNull(r['Sent At']), emailMessageId: str(r['Email Message Id']),
    })],
    ['EmailLog', (r) => ({
      id: str(r.ID), subject: str(r.Subject), member: emailToId(r.Member),
      recipientEmail: str(r['Recipient Email']), purpose: str(r.Purpose),
      shows: splitList(r.Shows).map((n) => nameToId(n)).filter(Boolean),
      body: str(r.Body), sentBy: str(r['Sent By']), sentAt: tsOrNull(r['Sent At']),
      batchId: str(r['Batch Id']),
    })],
  ];

  console.log('\nimporting:');
  for (const [table, map] of order) {
    const rows = loaded[table];
    if (!rows.length) { console.log(`  ${table.padEnd(18)} 0 rows, skipped`); continue; }
    const records = rows.map(map);
    // Upsert by the original Zite id, so a re-run updates instead of duplicating.
    await pool.query('BEGIN');
    try {
      for (const rec of records) {
        const cols = Object.keys(rec);
        const vals = cols.map((c) => rec[c]);
        const names = cols.map((c) => `"${c}"`).join(', ');
        const holes = cols.map((_c, i) => `$${i + 1}`).join(', ');
        const sets = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
        await pool.query(
          `INSERT INTO "${table}" (${names}) VALUES (${holes}) ON CONFLICT ("id") DO UPDATE SET ${sets}`,
          vals,
        );
      }
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw new Error(`${table} import failed: ${(err as Error).message}`);
    }
    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
    console.log(`  ${table.padEnd(18)} ${String(rows.length).padStart(4)} read -> ${String(n).padStart(4)} in db`);
    await loadLookups();
  }

  console.log('\nunresolved display-value lookups (these become NULL, rows are kept):');
  console.log(`  members: ${unresolved.member}  shows: ${unresolved.show}  tickets: ${unresolved.ticket}`);

  await closeDb();
}

main().catch(async (err) => {
  console.error(`\nmigration failed: ${(err as Error).message}`);
  await closeDb().catch(() => {});
  process.exit(1);
});
