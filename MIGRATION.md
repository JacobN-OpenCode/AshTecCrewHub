# Migration: Zite to self-hosted PostgreSQL

AshTec Crew Hub was built on Zite. It now runs on its own Express server with a
PostgreSQL database and no platform dependency at runtime. This document records
what moved, how the data was mapped, how it was verified, and how to undo it.

The importer is `scripts/migrate.ts`. It reads Zite CSV grid exports and is
idempotent: it upserts on each table's natural key, so re-running it repairs a
partial import instead of duplicating rows.

```bash
npm run migrate
```

## What was replaced

| Was | Is now |
| --- | --- |
| `zitejs/db` | `server/db/index.ts` — a small query builder over `pg` |
| `zitejs/backend` | `server/backend.ts` — the endpoint contract, `createEndpoint`, `ZiteError` |
| `zitejs/email` | `server/email.ts` — Nodemailer |
| `zitejs/auth` | `server/auth.ts` — magic-link tokens and database-backed sessions |
| Zite-hosted scheduling | `server/index.ts` — a native hourly scheduler |
| Zite-served frontend | Vite build, served by Express from `dist/` |

All 33 endpoints kept their names, input schemas and output shapes, so
`src/lib/api.ts` is regenerated from the same modules the server mounts and the
React components did not have to change their call sites.

## Schema

Ten domain tables plus two auth tables. Identifiers are quoted and mixed case
(`"CrewMembers"`) to match the shape the application code already used.

**No foreign keys are declared, deliberately.** The CSV exports contain rows that
reference members who have since been deleted — 23 Attendance rows and 7 Show
Response rows. Those references are kept and rendered as "Unknown member" rather
than discarded or cascaded away, so no historical record is lost.

### Natural keys

These are what the importer upserts on, and they are what the application relies
on to mean "the same thing":

| Table | Key |
| --- | --- |
| `ShowResponses` | `member:show` |
| `Attendance` | `member:subEvent` |
| `VenuePresence` | `session:member` |
| `PresenceSessions` | `subEvent:startedAt` |

### Constraints that carry behaviour

- **Partial unique** indexes on the Show Response and Attendance keys. This is
  what makes "set my response" and "set my availability" upserts rather than
  duplicate on every click.
- **One open session at a time.** A partial unique index on `PresenceSessions`
  where `state = 'Active'` enforces the single global active session, so two
  admins cannot open competing check-in sessions. It cannot be a plain unique
  index, because ended sessions must be allowed to accumulate.

### Types worth knowing

- `roles` and `headOf` are `text[]`.
- `alternateEmails` stays `text`, because it is a comma-separated list.
- `date` columns are true `date`s and serialise as `YYYY-MM-DD`; `timestamptz`
  columns serialise as ISO strings. The adapter handles this, so the browser
  receives the same shapes it always did.
- The schema declares **no default for `id`**, so the adapter generates a UUID in
  application code. This is the one thing a hand-written `INSERT` must supply
  itself; see the note below.

## Imported data

Row counts as verified against the exports:

| Table | Rows |
| --- | --- |
| CrewMembers | 18 |
| Shows | 5 |
| SubEvents | 21 |
| ShowResponses | 42 |
| Attendance | 114 |
| PresenceSessions | 3 |
| VenuePresence | 4 |
| SupportTickets | 19 |
| SupportReplies | 24 |
| EmailLog | 124 |

Preserved on purpose:

- 23 Attendance rows and 7 Show Response rows whose member no longer exists.
- All 21 Sub Events linked to their show; roles and head-of arrays intact.
- Real calendar dates rather than placeholders.
- 6 admin accounts.

### Display-value lookups

Some columns held a human-readable value instead of an id. The importer resolves
those back to ids and reports anything it cannot resolve rather than dropping the
row:

```
unresolved display-value lookups (these become NULL, rows are kept):
  members: 0  shows: 0  tickets: 0
```

A non-zero count here means a value in the export did not match any row — check
it before trusting the import.

## Verification

The importer prints counts; the smoke test proves the running application.

```bash
npm run typecheck
npm run smoke
```

The smoke test drives the real HTTP API with a real magic-link session and
covers, among other things:

- authentication is enforced, tokens are single-use, and sign-out revokes the
  session;
- **all four QR states** — `invalid`, `closed`, `ready` and `not_admin` — because
  a stale session previously surfaced as a platform error instead of a status;
- roster authorisation — ordinary crew refused, staff allowed to read but not to
  manage, admins allowed to manage;
- the write paths, including both upserts and that repeating an upsert updates
  rather than duplicating or colliding with the partial unique indexes.

It cleans up after itself and asserts the row counts are unchanged, so it is safe
to run against a live database and safe to run twice.

## Notes for future changes

- **Always supply `id` in a hand-written `INSERT`.** The schema has no default,
  because the application generates UUIDs. `db().<table>.create()` and
  `bulkCreate` do this for you; a raw `INSERT` that omits it fails with a
  not-null violation. (The smoke test seeds QR fixtures by hand and does exactly
  this.)
- **Regenerate the client** with `npm run gen:api` after touching the endpoint
  modules. It is deterministic — the same input produces the same file.
- **Re-running the importer is safe**, but it upserts. It will not remove rows
  that have disappeared from the export; delete those deliberately.

## Rollback

The migration adds new files and rewrites imports; it does not mutate the
originals in place.

1. **Before the first commit**, discard the working tree:
   ```bash
   git checkout -- .
   git clean -fd src/lib/api.ts server scripts
   ```
2. **After committing**, revert the migration commit:
   ```bash
   git revert <migration-commit>
   ```
3. **The database is independent of the code.** Rolling back the code does not
   touch it. To drop everything and start again:
   ```bash
   dropdb ashtec && createdb ashtec
   psql -d ashtec -f server/db/schema.sql
   npm run migrate
   ```
   Take a copy first if the live database has moved on since the import:
   ```bash
   pg_dump ashtec > ashtec-backup.sql
   ```
4. **Zite remains the source of truth** until this is signed off. The CSV exports
   are unmodified and uncommitted, so the original data can always be re-imported
   from them.