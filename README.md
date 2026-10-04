# AshTec Crew Hub

Crew management for AshTec: shows and events, attendance and availability,
venue check-in by QR code, and support tickets.

Self-hosted. React + Vite on the front, Express + PostgreSQL behind it. There is
no external platform dependency at runtime.

- **Production URL:** https://crew.mini-jacob.hackclub.app/
- **API port:** `1502` (the Vite dev server uses `8080` and proxies `/api` to it)

---

## Requirements

- Node.js 20 or newer (developed on 26.5.0)
- PostgreSQL 13 or newer. `gen_random_uuid()` is used, so it must be available —
  it is built in from PostgreSQL 13, or enable `pgcrypto` on older versions.

## Setup

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL
npm run migrate           # creates the schema and imports the CSV exports
```

`npm run migrate` is safe to re-run: it upserts on the natural keys, so it
repairs a partially imported database rather than duplicating it.

## Running it

```bash
npm run dev     # Vite on :8080 proxying /api and /healthz to Express on :1502
```

```bash
npm run build   # type-free production bundle into dist/
npm start       # Express serves dist/ and the API on :1502
```

In production the Express process serves the built SPA itself, so there is one
origin, one port and no CORS or `SameSite=None` cookie handling. Any unknown
path falls through to `index.html` so client-side routes deep-link correctly.

### Environment

See `.env.example` for the annotated list. The two that matter most:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Required. |
| `APP_URL` | Public base URL, no trailing slash. Used for magic links and email buttons. |
| `PORT` | Defaults to `1502`. |
| `SMTP_*` | **Optional in development, required in production.** |

With `SMTP_HOST` unset, emails are written to the server log instead of being
sent and the magic-link URL is printed there. That is deliberate so the app is
usable offline, but it means **sign-in links will never arrive in production
unless SMTP is configured.**

## Verifying a deployment

```bash
npm run typecheck   # both the app and the server/scripts projects
npm run smoke       # end-to-end, against a running server
```

`npm run smoke` is the check that matters. It drives the same `/api/<name>`
endpoints the browser calls, over HTTP, with a real session cookie obtained from
a real magic link, and deliberately imports no endpoint module — so it exercises
the router, auth and database wiring rather than just the business logic. It
covers every QR state (`invalid`, `closed`, `ready`, `not_admin`), roster
authorisation, and the write paths including both upserts. It cleans up after
itself and asserts the row counts are unchanged, so it is safe to run repeatedly
against a live database.

Point it at another host with `BASE_URL=https://... npm run smoke`.

## How it fits together

| Path | What it is |
| --- | --- |
| `src/` | React app. Calls the API through `src/lib/api.ts`. |
| `src/api/` | Endpoint implementations, shared by the server and the generated types. |
| `server/` | Express, auth, email, scheduling, PostgreSQL access. |
| `server/db/schema.sql` | Schema, indexes and constraints. |
| `scripts/` | CSV importer, API client generator, smoke test. |

### The API client is generated

`src/lib/api.ts` is generated from the endpoint modules:

```bash
npm run gen:api
```

Regenerate it after adding, renaming or removing an endpoint. Editing it by hand
will be overwritten.

### Aliases

`#api`, `#db`, `#backend`, `#email` and `#auth` are resolved by both Vite and
`tsconfig.json`. Endpoints import `#db` and `#backend`; the browser only ever
imports `#api` and `#auth`, which keeps `pg` and the server-only modules out of
the client bundle.

### Authentication

Single-use magic-link tokens (15 minutes) exchange for a database-backed session
(30 days) held in an `HttpOnly`, `SameSite=Lax` `crew_session` cookie. Sessions
are revoked server-side on sign-out and swept when they expire.

### Scheduled work

`supportEscalate` runs hourly in `Europe/London`. It is the only scheduled
endpoint. The browser never triggers it, and it receives `context.user === null`
because there is no signed-in member.

## Data

The production database is seeded from Zite CSV grid exports; see
[MIGRATION.md](./MIGRATION.md) for the field mapping, the verification queries
and how to roll back.

## Deploying

1. Provision PostgreSQL and create the database.
2. `npm ci && npm run build`
3. Set the environment (including `SMTP_*` and `APP_URL`) in the service unit or
   an environment file with restrictive permissions.
4. `npm run migrate`
5. Run `npm start` under a supervisor such as systemd, bound to `1502`.
6. Terminate TLS in front of it and proxy to `127.0.0.1:1502`.