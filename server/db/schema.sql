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
  "timings"           text NOT NULL DEFAULT '',
  "importance"        text NOT NULL DEFAULT 'Medium',
  "thingsToBring"     text NOT NULL DEFAULT '',
  "responseDueDate"   date,
  "dueDateUnknown"    boolean NOT NULL DEFAULT false,
  "hidden"            boolean NOT NULL DEFAULT false,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SubEvents_date_idx" ON "SubEvents" ("date");

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
CREATE INDEX IF NOT EXISTS "VenuePresence_member_idx" ON "VenuePresence" ("member");
CREATE INDEX IF NOT EXISTS "VenuePresence_session_idx" ON "VenuePresence" ("session");

CREATE TABLE IF NOT EXISTS "SupportTickets" (
  "id"                   uuid PRIMARY KEY,
  "subject"              text NOT NULL,
  "type"                 text NOT NULL DEFAULT '',
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

COMMIT;