/**
 * Postgres implementation of the `zite.<table>.<method>()` data surface that the
 * 33 endpoints in src/api/ are written against.
 *
 * The goal is a *behavioural* drop-in, so the contract is deliberately identical:
 *
 *   findAll({ filters?, limit? })        -> { records }
 *   findOne({ id? , filters? })          -> record | undefined
 *   create({ record })                   -> record (with id)
 *   update({ id, record })               -> record | undefined
 *   delete({ id })                       -> void
 *   bulkCreate({ records, matchOn? })    -> { records }   (upsert when matchOn)
 *   sql({ query, params })               -> { rows }
 *
 * Records come back with Zite's value conventions, which is what keeps the
 * endpoint code working unchanged:
 *   - link columns are plain uuid strings (every read site goes through `ids()`
 *     in src/lib/server.ts, which accepts string | string[]);
 *   - `date` columns are 'YYYY-MM-DD' strings, NOT Date objects, because the UI
 *     and mapSubEvent() compare them as strings;
 *   - `timestamptz` columns are ISO-8601 strings, because activeSession() sorts
 *     sessions with `startedAt.localeCompare(...)`.
 *
 * Those two conversions are done once, globally, via pg type parsers below,
 * rather than per column, so a new column can never silently regress them.
 */
import { randomUUID } from 'node:crypto';
import { Pool, types } from 'pg';

// DATE (1082) -> keep the raw 'YYYY-MM-DD' string. Left to node-postgres this
// becomes a Date at *local* midnight, which shifts the day for anyone west of
// UTC and breaks every `date < todayIso()` deadline comparison in the app.
types.setTypeParser(1082, (v) => v);
// TIMESTAMPTZ (1184) -> ISO-8601 string. activeSession() sorts with localeCompare
// on startedAt, which requires a string, not a Date.
types.setTypeParser(1184, (v) => new Date(v).toISOString());

/** uuid[] columns: written as string | string[], stored as an array. */
interface TableDef {
  table: string;
  arr: string[];
}

const TABLES = {
  crewMembers: { table: 'CrewMembers', arr: ['roles', 'headOf'] },
  shows: { table: 'Shows', arr: [] },
  subEvents: { table: 'SubEvents', arr: ['shows'] },
  showResponses: { table: 'ShowResponses', arr: [] },
  attendance: { table: 'Attendance', arr: [] },
  presenceSessions: { table: 'PresenceSessions', arr: [] },
  venuePresence: { table: 'VenuePresence', arr: [] },
  supportTickets: { table: 'SupportTickets', arr: ['assignedMaintainers'] },
  supportReplies: { table: 'SupportReplies', arr: [] },
  emailLog: { table: 'EmailLog', arr: ['shows'] },
} as const satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;

/** Record types are structurally open: the endpoints read/write optional fields. */
export type AnyRecord = Record<string, any>;

/**
 * Record types stay a bare index signature rather than an intersection with
 * `{ id: string }`. Postgres always returns an id, but adding it here made every
 * call site a "weak type" mismatch against the small structural helpers the app
 * passes rows into (fullName, mapPresence), so id is asserted at the few spots
 * that actually need it instead.
 */
export type CrewMembersRecordType = AnyRecord;
export type SubEventsRecordType = AnyRecord;
export type ShowsRecordType = AnyRecord;

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Field names reach us as object keys in `record`/`filters`, which are always
 * string literals in our own source. Anything that fails this is a bug, and
 * quoting it blindly would be an injection hole, so fail loudly instead.
 */
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Refusing to use unsafe column name: ${name}`);
  return `"${name}"`;
}

let pool: Pool | null = null;

export function db(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and point it at Postgres.');
  }
  pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    // Every timestamp in this schema is written by the server, so a connection
    // left in a session timezone would reinterpret them.
    options: '-c timezone=UTC',
  });
  pool.on('error', (err) => {
    console.error('[db] idle client error', err);
  });
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

type FilterValue = string | number | boolean | null | { in: (string | number)[] };
type Filters = Record<string, FilterValue>;

function where(filters?: Filters): { sql: string; params: any[] } {
  if (!filters) return { sql: '', params: [] };
  const parts: string[] = [];
  const params: any[] = [];
  for (const [col, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    if (val && typeof val === 'object' && 'in' in val) {
      const list = (val as { in: (string | number)[] }).in ?? [];
      if (!list.length) {
        // `= ANY('{}')` is already false, but an explicit FALSE keeps the plan
        // obvious and avoids a type-inference edge case on an empty array.
        parts.push('FALSE');
        continue;
      }
      params.push(list);
      parts.push(`${ident(col)} = ANY($${params.length})`);
      continue;
    }
    if (val === null) {
      parts.push(`${ident(col)} IS NULL`);
      continue;
    }
    params.push(val);
    parts.push(`${ident(col)} = $${params.length}`);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

/** Splits a record into insertable columns, normalising uuid[] and link fields. */
/**
 * Zite minted the record id server-side on create. Our schema deliberately has
 * no column default (ids are preserved verbatim from the export), so the adapter
 * has to do it -- otherwise every endpoint that calls create() without passing an
 * id (submitSupport, presenceStart, adminSaveMember, ...) hits a not-null
 * violation. Zite ids were uuid v4, so keep that shape.
 */
function withId(record: AnyRecord): AnyRecord {
  return record.id === undefined || record.id === null || record.id === ''
    ? { id: randomUUID(), ...record }
    : record;
}

function prepare(def: TableDef, record: AnyRecord) {
  const cols: string[] = [];
  const vals: any[] = [];
  for (const [col, raw] of Object.entries(record)) {
    if (raw === undefined) continue;
    let value = raw;
    if (def.arr.includes(col)) {
      // A single id is accepted for an array column so callers can pass
      // `shows: id` or `shows: [id]` interchangeably, matching Zite.
      if (value === null || value === '') value = [];
      else if (!Array.isArray(value)) value = [value];
      else value = value.filter((v) => v !== null && v !== undefined && v !== '');
    } else if (Array.isArray(value)) {
      // Single-link column handed an array: keep the first, as Zite did.
      value = value.length ? value[0] : null;
    }
    cols.push(col);
    vals.push(value);
  }
  return { cols, vals };
}

function makeTable(def: TableDef) {
  const t = ident(def.table);
  return {
    async findAll(args: { filters?: Filters; limit?: number } = {}) {
      const w = where(args.filters);
      const limit = args.limit != null ? ` LIMIT ${Number(args.limit)}` : '';
      const { rows } = await db().query(`SELECT * FROM ${t}${w.sql}${limit}`, w.params);
      return { records: rows as AnyRecord[] };
    },
    async findOne(args: { id?: string; filters?: Filters } = {}) {
      const clauses: string[] = [];
      const params: any[] = [];
      if (args.id) {
        params.push(args.id);
        clauses.push(`"id" = $${params.length}`);
      }
      const w = where(args.filters);
      if (w.sql) {
        // Re-number the filter params so they continue after the id param.
        const shifted = w.sql.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) + params.length}`);
        params.push(...w.params);
        clauses.push(shifted.replace(/^ WHERE /, ''));
      }
      const sql = `SELECT * FROM ${t}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} LIMIT 1`;
      const { rows } = await db().query(sql, params);
      return (rows[0] as AnyRecord | undefined) ?? undefined;
    },
    async create({ record }: { record: AnyRecord }) {
      const { cols, vals } = prepare(def, withId(record));
      const names = cols.map(ident).join(', ');
      const holes = cols.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db().query(
        `INSERT INTO ${t} (${names}) VALUES (${holes}) RETURNING *`,
        vals,
      );
      return rows[0] as AnyRecord;
    },
    async update({ id, record }: { id: string; record: AnyRecord }) {
      const { cols, vals } = prepare(def, record);
      if (!cols.length) return undefined;
      const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(', ');
      const { rows } = await db().query(
        `UPDATE ${t} SET ${sets}, "updatedAt" = now() WHERE "id" = $${cols.length + 1} RETURNING *`,
        [...vals, id],
      );
      return (rows[0] as AnyRecord | undefined) ?? undefined;
    },
    async delete({ id }: { id: string }) {
      await db().query(`DELETE FROM ${t} WHERE "id" = $1`, [id]);
    },
    async bulkCreate({ records, matchOn }: { records: AnyRecord[]; matchOn?: string[] }) {
      if (!records.length) return { records: [] as AnyRecord[] };
      if (!matchOn?.length) {
        const out: AnyRecord[] = [];
        for (const r of records) out.push(await this.create({ record: r }));
        return { records: out };
      }
      // Upsert on the caller's key. Requires the matching partial unique index
      // (see schema.sql: Attendance_attendanceKey / ShowResponses_responseKey).
      const out: AnyRecord[] = [];
      for (const r of records) {
        const keys = matchOn.map((k) => {
          if (!IDENT.test(k)) throw new Error(`Refusing to use unsafe matchOn column: ${k}`);
          return k;
        });
        const { cols, vals } = prepare(def, withId(r));
        const conflict = keys.map(ident).join(', ');
        // Never let a conflict path reassign an existing row's id.
        const updatable = cols.filter((c) => !keys.includes(c) && c !== 'id');
        const sets = updatable.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ');
        const names = cols.map(ident).join(', ');
        const holes = cols.map((_, i) => `$${i + 1}`).join(', ');
        const onConflict = updatable.length
          ? `DO UPDATE SET ${sets}, "updatedAt" = now()`
          : 'DO NOTHING';
        // The conflict-key values are already in `vals` because matchOn columns
        // are part of the record, so ON CONFLICT needs no extra parameters.
        const { rows } = await db().query(
          `INSERT INTO ${t} (${names}) VALUES (${holes}) ` +
            `ON CONFLICT (${conflict}) ` +
            `WHERE ${conflict.split(', ').map((c) => `${c} <> ''`).join(' AND ')} ` +
            `${onConflict} RETURNING *`,
          vals,
        );
        if (rows[0]) {
          out.push(rows[0] as AnyRecord);
        } else {
          // DO NOTHING returns no row, so read the existing one back to keep the
          // caller's `records` shape identical either way.
          const w = where(Object.fromEntries(keys.map((k) => [k, r[k] ?? null])));
          const { rows: existing } = await db().query(
            `SELECT * FROM ${t}${w.sql} LIMIT 1`,
            w.params,
          );
          if (existing[0]) out.push(existing[0] as AnyRecord);
        }
      }
      return { records: out };
    },
  };
}

export const zite = {
  ...Object.fromEntries(
    Object.entries(TABLES).map(([name, def]) => [name, makeTable(def as TableDef)]),
  ) as Record<TableName, ReturnType<typeof makeTable>>,
  async sql({ query, params }: { query: string; params?: any[] }) {
    // Raw SQL passthrough, used by findMemberByEmail / adminCount / the
    // duplicate-email check in src/lib/server.ts.
    const res = await db().query(query, params ?? []);
    return { rows: res.rows };
  },
};

export type Zite = typeof zite;

/** Applies schema.sql. Safe to run repeatedly. */
export async function migrateSchema(): Promise<void> {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const sql = readFileSync(`${here}schema.sql`, 'utf8');
  await db().query(sql);
}