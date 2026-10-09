-- AshTec Crew Hub — PostgreSQL schema
--
-- IDENTIFIERS ARE DELIBERATELY ZITE-SHAPED ("CrewMembers", "schoolEmail").
-- src/lib/server.ts contains three raw `zite.sql` queries written against those
-- exact names ("SELECT ... FROM "CrewMembers" WHERE lower("schoolEmail") = ...").
-- Mirroring the identifiers keeps that business-critical membership/alternate-email
-- lookup byte-identical instead of translated, and removes ~90 camel<->snake
-- mappings from the data layer. Postgres is case-sensitive here, so every
-- hand-written query must quote identifiers.
--
-- Column set is derived from the Zite production CSV exports (real columns only --
-- Zite's linked-record/rollup display columns are intentionally NOT reproduced)
-- cross-checked against every field the 33 endpoints in src/api read or write.
--
-- Deliberate choices:
--  * Zite UUIDs are preserved verbatim as "id", so links already recorded in
--    email bodies keep pointing at the right rows.
--  * NO foreign-key constraints. The production export contains rows whose member
--    was later deleted in Zite (23 attendance rows and 7 show-response rows point
--    at member ids that no longer exist). Zite soft-deletes, so those child rows
--    survived. Enforcing FKs would reject the import; dropping the rows would
--    lose data. Links are plain columns and nothing in the app iterates children
--    of a non-existent member, so the orphans are inert.
--  * "roles"/"headOf" are text[] because src/lib/server.ts mapMember and the admin
--    UI treat them as arrays (.includes/.map/.length). Zite's CSV export flattens
--    multi-selects to a comma-joined string, so the importer splits them back.
--  * "alternateEmails" stays `text`, NOT text[]: findMemberByEmail calls
--    string_to_array() on it inside SQL, which requires text.
--  * Blank CSV cells become NULL, matching the nulls the endpoints write
--    (e.g. `pendingAction: null`).

BEGIN;

CREATE TABLE IF NOT EXISTS "CrewMembers" (
  "id"                 uuid PRIMARY KEY,
  "schoolEmail"        text NOT NULL,
  "firstName"          text NOT NULL DEFAULT '',
  "lastName"           text NOT NULL DEFAULT '',
  "year"               text NOT NULL DEFAULT '',
  "isAdmin"            boolean NOT NULL DEFAULT false,
  "memberType"         text NOT NULL DEFAULT 'Normal Member',
  "roles"              text[] NOT NULL DEFAULT '{}',
  "headOf"             text[] NOT NULL DEFAULT '{}',
  "preferredRole1"     text NOT NULL DEFAULT '',
  "preferredRole2"     text NOT NULL DEFAULT '',
  "adminNotes"         text NOT NULL DEFAULT '',
  "isMaintainer"       boolean NOT NULL DEFAULT false,
  "isPreviewAccount"   boolean NOT NULL DEFAULT false,
  "alternateEmails"    text NOT NULL DEFAULT '',
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrewMembers_schoolEmail_key" ON "CrewMembers" (lower("schoolEmail"));

CREATE TABLE IF NOT EXISTS "Shows" (
  "id"                uuid PRIMARY KEY,
  "showName"          text NOT NULL,
  "shortCode"         text NOT NULL DEFAULT '',
  "description"       text NOT NULL DEFAULT '',
  "responseDueDate"   date,
  "dueDateUnknown"    boolean NOT NULL DEFAULT false,
  "hidden"            boolean NOT NULL DEFAULT false,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SubEvents" (
  "id"                uuid PRIMARY KEY,
  "title"             text NOT NULL,
  "type"              text NOT NULL DEFAULT 'Rehearsal',
  "subtype"           text NOT NULL DEFAULT '',
  "shows"             uuid[] NOT NULL DEFAULT '{}',
  "date"              date,
  "dateTbc"           boolean NOT NULL DEFAULT false,
  "description"       text NOT NULL DEFAULT '',
  "meetTime"          text NOT NULL DEFAULT '',
  -- Structured start/end for the calendar feed. Both are HH:MM in 24-hour
  -- time (so "19:30"), nullable because dates can still be set ahead of
  -- times. The previous free-text "timings" column was dropped when these
  -- landed, and the live data was migrated from it.
  "startTime"         text,
  "endTime"           text,
  "importance"        text NOT NULL DEFAULT 'Medium',
  "thingsToBring"     text NOT NULL DEFAULT '',
  "responseDueDate"   date,
  "dueDateUnknown"    boolean NOT NULL DEFAULT false,
  "hidden"            boolean NOT NULL DEFAULT false,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SubEvents_date_idx" ON "SubEvents" ("date");
-- Bring any older SubEvents table up to date: add the structured times so
-- the data-migration script (scripts/migrate.ts end-of-run step) can find
-- a place to land the parsed values. The actual row-by-row migration runs
-- in TypeScript so the parsing is easy to test; setting them up here
-- makes the rest of the schema apply idempotently even on a freshly
-- imported database that never had "timings".
ALTER TABLE "SubEvents" ADD COLUMN IF NOT EXISTS "startTime" text;
ALTER TABLE "SubEvents" ADD COLUMN IF NOT EXISTS "endTime" text;

CREATE TABLE IF NOT EXISTS "ShowResponses" (
  "id"               uuid PRIMARY KEY,
  "responseKey"      text NOT NULL DEFAULT '',
  "member"           uuid,
  "show"             uuid,
  "response"         text NOT NULL DEFAULT '',
  "enteredByAdmin"   boolean NOT NULL DEFAULT false,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ShowResponses_member_idx" ON "ShowResponses" ("member");
CREATE INDEX IF NOT EXISTS "ShowResponses_show_idx" ON "ShowResponses" ("show");
-- The upsert target for zite.showResponses.bulkCreate({ matchOn: ['responseKey'] })
-- in setShowResponse.ts: one response per member per show.
CREATE UNIQUE INDEX IF NOT EXISTS "ShowResponses_responseKey_uniq"
  ON "ShowResponses" ("responseKey") WHERE "responseKey" <> '';

CREATE TABLE IF NOT EXISTS "Attendance" (
  "id"               uuid PRIMARY KEY,
  "attendanceKey"    text NOT NULL DEFAULT '',
  "member"           uuid,
  "subEvent"         uuid,
  "status"           text NOT NULL DEFAULT '',
  "reason"           text NOT NULL DEFAULT '',
  "enteredByAdmin"   boolean NOT NULL DEFAULT false,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Attendance_member_idx" ON "Attendance" ("member");
CREATE INDEX IF NOT EXISTS "Attendance_subEvent_idx" ON "Attendance" ("subEvent");
-- The upsert target for zite.attendance.bulkCreate({ matchOn: ['attendanceKey'] })
-- in upsertAttendance(). Partial so that rows imported without a key (there are
-- none today, but the column is NOT NULL DEFAULT '') can never block each other.
CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_attendanceKey_uniq"
  ON "Attendance" ("attendanceKey") WHERE "attendanceKey" <> '';

CREATE TABLE IF NOT EXISTS "PresenceSessions" (
  "id"           uuid PRIMARY KEY,
  "sessionKey"   text NOT NULL DEFAULT '',
  "subEvent"     uuid,
  "startedBy"    uuid,
  "startedAt"    timestamptz,
  "endedAt"      timestamptz,
  "endedBy"      uuid,
  "status"       text NOT NULL DEFAULT 'Active',
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
-- Enforces the "one global active check-in session" rule from src/lib/presence.ts
-- in the database as well, so a race can't create two.
CREATE UNIQUE INDEX IF NOT EXISTS "PresenceSessions_one_active"
  ON "PresenceSessions" ((true)) WHERE "status" = 'Active';

CREATE TABLE IF NOT EXISTS "VenuePresence" (
  "id"                uuid PRIMARY KEY,
  "presenceKey"       text NOT NULL DEFAULT '',
  "session"           uuid,
  "member"            uuid,
  "state"             text,
  "reasonLabel"       text NOT NULL DEFAULT '',
  "reason"            text NOT NULL DEFAULT '',
  "comingBack"        boolean NOT NULL DEFAULT false,
  "expectedBackAt"    timestamptz,
  "signedInAt"        timestamptz,
  "signedOutAt"       timestamptz,
  "updatedBy"         uuid,
  "approvalToken"     text NOT NULL DEFAULT '',
  "pendingAction"     text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

-- Append-only log of every venue check-in decision (ticket 168e8274). The
-- VenuePresence row above is one row per member per session and is overwritten
-- on each approval, so it can only ever show the latest sign-in/out. This table
-- keeps the whole timeline: each sign-in, sign-out, decline and the session
-- open/close, with the admin who made the call.
CREATE TABLE IF NOT EXISTS "VenuePresenceEvents" (
  "id"             uuid PRIMARY KEY,
  "eventKey"       text NOT NULL DEFAULT '',
  "session"        uuid,
  "member"         uuid,
  "action"         text NOT NULL,
  "reasonLabel"    text NOT NULL DEFAULT '',
  "reason"         text NOT NULL DEFAULT '',
  "comingBack"     boolean NOT NULL DEFAULT false,
  "expectedBackAt" timestamptz,
  "at"             timestamptz NOT NULL DEFAULT now(),
  "by"             uuid,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "VenuePresenceEvents_session_idx" ON "VenuePresenceEvents" ("session");
CREATE INDEX IF NOT EXISTS "VenuePresenceEvents_member_idx" ON "VenuePresenceEvents" ("member");
CREATE INDEX IF NOT EXISTS "VenuePresence_member_idx" ON "VenuePresence" ("member");
CREATE INDEX IF NOT EXISTS "VenuePresence_session_idx" ON "VenuePresence" ("session");

CREATE TABLE IF NOT EXISTS "SupportTickets" (
  "id"                   uuid PRIMARY KEY,
  "subject"              text NOT NULL,
  "type"                 text NOT NULL DEFAULT '',
  "severity"             text NOT NULL DEFAULT '',
  "message"              text NOT NULL DEFAULT '',
  "submittedBy"          uuid,
  "status"               text NOT NULL DEFAULT 'Open',
  "adminNotes"           text NOT NULL DEFAULT '',
  "page"                 text NOT NULL DEFAULT '',
  "submittedAt"          timestamptz,
  "assignedMaintainers"  uuid[] NOT NULL DEFAULT '{}',
  "lastReplyFrom"        text NOT NULL DEFAULT '',
  "lastReplyAt"          timestamptz,
  "escalatedAt"          timestamptz,
  "referToOpencode"      text NOT NULL DEFAULT '',
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedAt"            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SupportTickets_status_idx" ON "SupportTickets" ("status");

CREATE TABLE IF NOT EXISTS "SupportReplies" (
  "id"               uuid PRIMARY KEY,
  "replyKey"         text NOT NULL DEFAULT '',
  "ticket"           uuid,
  "author"           uuid,
  "kind"             text NOT NULL DEFAULT '',
  "body"             text NOT NULL DEFAULT '',
  "recipients"       text NOT NULL DEFAULT '',
  "sentAt"           timestamptz,
  "emailMessageId"   text NOT NULL DEFAULT '',
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SupportReplies_ticket_idx" ON "SupportReplies" ("ticket");

CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id"              uuid PRIMARY KEY,
  "subject"         text NOT NULL DEFAULT '',
  "member"          uuid,
  "recipientEmail"  text NOT NULL DEFAULT '',
  "purpose"         text NOT NULL DEFAULT '',
  "shows"           uuid[] NOT NULL DEFAULT '{}',
  "body"            text NOT NULL DEFAULT '',
  "sentBy"          text NOT NULL DEFAULT '',
  "sentAt"          timestamptz,
  "batchId"         text NOT NULL DEFAULT '',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "EmailLog_member_idx" ON "EmailLog" ("member");

-- ---------------------------------------------------------------------------
-- Auth: magic link + DB-backed session cookie.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AuthMagicTokens" (
  "token"      text PRIMARY KEY,
  "email"      text NOT NULL,
  "firstName"  text NOT NULL DEFAULT '',
  "lastName"   text NOT NULL DEFAULT '',
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL,
  "usedAt"     timestamptz
);
CREATE INDEX IF NOT EXISTS "AuthMagicTokens_email_idx" ON "AuthMagicTokens" ("email");

CREATE TABLE IF NOT EXISTS "AuthSessions" (
  "id"         uuid PRIMARY KEY,
  "email"      text NOT NULL,
  "firstName"  text NOT NULL DEFAULT '',
  "lastName"   text NOT NULL DEFAULT '',
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AuthSessions_email_idx" ON "AuthSessions" ("email");

-- Admin-notification opt-in, per member. NULL means "not chosen" and falls back
-- to the sensible default: on for admins, off for everyone else. A column rather
-- than a settings row because it is genuinely per-person.
ALTER TABLE "CrewMembers" ADD COLUMN IF NOT EXISTS "adminNotifications" boolean;

-- Small key/value store for app-wide settings the server sets for itself (the
-- generated VAPID keypair) and that an admin can flip at runtime. Created IF NOT
-- EXISTS so it is safe to re-run.
CREATE TABLE IF NOT EXISTS "AppSettings" (
  "key"   text PRIMARY KEY,
  "value" text NOT NULL
);

-- Web Push subscriptions, one row per browser/device a member has enabled
-- notifications on. A member can have several (phone + laptop), so this is keyed
-- by the subscription endpoint rather than by member.
CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
  "id"         uuid PRIMARY KEY,
  "endpoint"   text NOT NULL,
  "member"     uuid,
  "p256dh"     text NOT NULL,
  "auth"       text NOT NULL,
  "userAgent"  text NOT NULL DEFAULT '',
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscriptions_endpoint_idx" ON "PushSubscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscriptions_member_idx" ON "PushSubscriptions" ("member");

-- What has already been pushed, so a scheduler that runs every minute does not
-- send the same "your form is due" twenty times. The key is the member, the kind
-- of notification and the thing it refers to; one row means "sent once".
CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id"         uuid PRIMARY KEY,
  "dedupeKey"  text NOT NULL,
  "member"     uuid,
  "kind"       text NOT NULL,
  "sentAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_dedupe_idx" ON "NotificationLog" ("dedupeKey");

-- ---------------------------------------------------------------------------
-- Activity log: one row per HTTP request plus client-reported page views.
-- ---------------------------------------------------------------------------
-- Feeds the "Logs" popup on Server diagnostics. Every request the Express
-- server handles is recorded here (method, path, status, latency, who made it,
-- from which device/IP and referring page). Member page views are added by the
-- client via /analyticsView so SPA navigation is captured too, and the browser
-- reports how long someone stayed on a view via /analyticsLeave, which fills in
-- "viewSeconds" in place. Both kinds share one row shape: API calls and static
-- file loads carry latencyMs and status, views carry viewSeconds.
--
-- Retention: 30 days, enforced by the hourly prune in server/index.ts.
CREATE TABLE IF NOT EXISTS "RequestLogs" (
  "id"           uuid PRIMARY KEY,
  "at"           timestamptz NOT NULL DEFAULT now(),
  "method"       text NOT NULL DEFAULT '',
  "path"         text NOT NULL DEFAULT '',
  "status"       integer NOT NULL DEFAULT 0,
  "latencyMs"    integer NOT NULL DEFAULT 0,
  "viewSeconds"  integer NOT NULL DEFAULT 0,
  "authorized"   boolean NOT NULL DEFAULT false,
  "email"        text NOT NULL DEFAULT '',
  "ip"           text NOT NULL DEFAULT '',
  "userAgent"    text NOT NULL DEFAULT '',
  "referer"      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "RequestLogs_at_idx" ON "RequestLogs" ("at" DESC);
CREATE INDEX IF NOT EXISTS "RequestLogs_email_idx" ON "RequestLogs" ("email");
CREATE INDEX IF NOT EXISTS "RequestLogs_path_idx" ON "RequestLogs" ("path");

-- ---------------------------------------------------------------------------
-- Live Show: the backstage live-show dashboard (ticket 0cdcd997). One config
-- row per show (per-show customisation), opened by an admin at runtime. When a
-- row is "open", /show-dash is public behind a show code, the Live Show tab
-- appears for everyone, and signed-in crew get a dashboard with slightly more
-- access (crewCanEdit). Only one show can be open at a time, enforced by
-- adminSaveLiveShow closing any other open row first.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LiveShows" (
  "id"                  uuid PRIMARY KEY,
  "showId"              uuid,
  "name"                text NOT NULL DEFAULT '',
  "areaName"            text NOT NULL DEFAULT 'Stage',
  "status"              text NOT NULL DEFAULT 'standby',
  "open"                boolean NOT NULL DEFAULT false,
  "code"                text NOT NULL DEFAULT '',
  "intermissionMinutes" int NOT NULL DEFAULT 15,
  "timerMode"           text NOT NULL DEFAULT 'stopped',
  "timerStartAt"        timestamptz,
  "timerElapsedMs"      bigint NOT NULL DEFAULT 0,
  "currentSceneIndex"   int NOT NULL DEFAULT 0,
  "crewCanEdit"         boolean NOT NULL DEFAULT false,
  "updatedBy"           uuid,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveShows_showId_key" ON "LiveShows" ("showId") WHERE "showId" IS NOT NULL;

-- One row per scene in the show's running order. Admin-customisable; the order
-- comes from sortIndex (0, 1, 2...), re-written wholesale on save.
CREATE TABLE IF NOT EXISTS "LiveShowScenes" (
  "id"           uuid PRIMARY KEY,
  "liveShowId"   uuid NOT NULL,
  "label"        text NOT NULL DEFAULT '',
  "title"        text NOT NULL DEFAULT '',
  "minutes"      int NOT NULL DEFAULT 0,
  "cast"         text[] NOT NULL DEFAULT '{}',
  "props"        text[] NOT NULL DEFAULT '{}',
  "notes"        text[] NOT NULL DEFAULT '{}',
  "sortIndex"    int NOT NULL DEFAULT 0,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "LiveShowScenes_liveShowId_idx" ON "LiveShowScenes" ("liveShowId");

-- Editable scripts (ticket 12d8df62). One shared document per live show plus
-- one private per member; upsert targets are the two partial unique indexes.
CREATE TABLE IF NOT EXISTS "LiveShowScripts" (
  "id"          uuid PRIMARY KEY,
  "liveShowId"  uuid NOT NULL,
  "scope"       text NOT NULL,
  "authorId"    uuid,
  "content"     text NOT NULL DEFAULT '',
  "sharedLink"  text NOT NULL DEFAULT '',
  "privateLink" text NOT NULL DEFAULT '',
  "updatedBy"   uuid,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveShowScripts_shared_key"
  ON "LiveShowScripts" ("liveShowId", "scope") WHERE "scope" = 'shared';
CREATE UNIQUE INDEX IF NOT EXISTS "LiveShowScripts_private_key"
  ON "LiveShowScripts" ("liveShowId", "scope", "authorId") WHERE "scope" = 'private' AND "authorId" IS NOT NULL;

-- Additive changes for databases created before these columns existed. The
-- CREATE TABLE IF NOT EXISTS statements above cannot add columns, so idempotent
-- ALTERs bring older databases up to date. No-ops on a fresh install.
ALTER TABLE "SupportTickets"  ADD COLUMN IF NOT EXISTS "severity"    text NOT NULL DEFAULT '';
ALTER TABLE "LiveShowScenes"  ADD COLUMN IF NOT EXISTS "props"        text[] NOT NULL DEFAULT '{}';
ALTER TABLE "LiveShowScripts" ADD COLUMN IF NOT EXISTS "sharedLink"  text NOT NULL DEFAULT '';
ALTER TABLE "LiveShowScripts" ADD COLUMN IF NOT EXISTS "privateLink" text NOT NULL DEFAULT '';

COMMIT;