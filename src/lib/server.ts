// Backend-only helpers shared by endpoints in src/api/.
import { zite } from '#db';
import type { CrewMembersRecordType, SubEventsRecordType, ShowsRecordType } from '#db';

export const ids = (v?: string | string[] | null): string[] => (v ? (Array.isArray(v) ? v : [v]) : []);

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const isPastDue = (due?: string, unknown?: boolean) => !unknown && !!due && due < todayIso();
export const wordCount = (s?: string | null) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

export async function findMemberByEmail(email?: string | null): Promise<CrewMembersRecordType | undefined> {
  // Input schemas warn rather than halt, so execute still runs with a missing
  // field. Every authenticated endpoint funnels through here, so an empty
  // needle has to be handled once here instead of 500ing per caller.
  const needle = (email ?? '').trim();
  if (!needle) return undefined;
  // Primary address first, then any exact token in the comma-separated
  // alternates list. Splitting in SQL keeps 'a@b.com' from matching a stray
  // 'xa@b.com' inside someone else's list.
  const { rows } = await zite.sql({
    query:
      'SELECT "id" FROM "CrewMembers" WHERE lower("schoolEmail") = lower($1)' +
      ` OR EXISTS (SELECT 1 FROM unnest(string_to_array(COALESCE("alternateEmails", ''), ',')) AS alt` +
      ' WHERE lower(btrim(alt)) = lower($1))' +
      ' ORDER BY (lower("schoolEmail") = lower($1)) DESC LIMIT 1',
    params: [needle],
  });
  const id = rows[0]?.id as string | undefined;
  return id ? zite.crewMembers.findOne({ id }) : undefined;
}

export async function adminCount(): Promise<number> {
  const { rows } = await zite.sql({ query: 'SELECT COUNT(*)::int AS "n" FROM "CrewMembers" WHERE "isAdmin" = true' });
  return Number(rows[0]?.n ?? 0);
}

export async function requireMember(email: string) {
  const m = await findMemberByEmail(email);
  if (!m) throw new Error('Your email is not on the AshTec crew list. Ask an admin to add you.');
  return m;
}

export async function requireAdmin(email: string) {
  const m = await requireMember(email);
  if (!m.isAdmin) throw new Error('Admins only.');
  return m;
}

/** Acting as yourself, or (admins only) on behalf of another member. */
export async function resolveTarget(email: string, memberId?: string) {
  const me = await requireMember(email);
  if (!memberId || memberId === me.id) return { member: me, byAdmin: false };
  if (!me.isAdmin) throw new Error('Admins only.');
  const member = await zite.crewMembers.findOne({ id: memberId });
  if (!member) throw new Error('Member not found.');
  // Preview (pretend) accounts follow the normal member rules, as if they were acting themselves.
  return { member, byAdmin: !member.isPreviewAccount };
}

/** The member the caller is acting as: themselves, or (admins only) a preview account. */
export async function actingMember(email: string, previewAs?: string) {
  const me = await requireMember(email);
  if (!previewAs || previewAs === me.id) return me;
  if (!me.isAdmin) throw new Error('Admins only.');
  const m = await zite.crewMembers.findOne({ id: previewAs });
  if (!m?.isPreviewAccount) throw new Error('You can only preview as a preview account.');
  return m;
}

/** Real people who can receive email (no preview accounts). */
export const isEmailable = (m: CrewMembersRecordType) => !!m.schoolEmail && !m.isPreviewAccount;
export const isStaff = (m: CrewMembersRecordType) => m.memberType === 'Teacher' || m.year === 'Staff';

export const mapShow = (s: ShowsRecordType) => ({
  id: s.id,
  name: s.showName ?? 'Untitled show',
  code: s.shortCode ?? '',
  description: s.description ?? '',
  dueDate: s.responseDueDate ?? null,
  dueUnknown: !!s.dueDateUnknown,
  hidden: !!s.hidden,
});

export const mapSubEvent = (e: SubEventsRecordType) => ({
  id: e.id,
  title: e.title ?? 'Untitled',
  type: e.type ?? 'Rehearsal',
  subtype: e.subtype ?? '',
  showIds: ids(e.shows),
  date: e.date ?? null,
  dateTbc: !!e.dateTbc,
  description: e.description ?? '',
  meetTime: e.meetTime ?? '',
  timings: e.timings ?? '',
  thingsToBring: e.thingsToBring ?? '',
  importance: e.importance ?? 'Medium',
  dueDate: e.responseDueDate ?? null,
  dueUnknown: !!e.dueDateUnknown,
  hidden: !!e.hidden,
});

export const mapMember = (m: CrewMembersRecordType) => ({
  id: m.id,
  firstName: m.firstName ?? '',
  lastName: m.lastName ?? '',
  shortUsername: `${(m.lastName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')}${(m.firstName ?? '').slice(0, 1).toLowerCase()}` || (m.schoolEmail ?? '').split('@')[0],
  year: m.year ?? '',
  email: m.schoolEmail ?? '',
  isAdmin: !!m.isAdmin,
  // Staff can read the check-in roster without being able to run it.
  isStaff: isStaff(m),
  memberType: m.memberType ?? 'Normal Member',
  roles: m.roles ?? [],
  headOf: m.headOf ?? [],
  preferredRole1: m.preferredRole1 ?? '',
  preferredRole2: m.preferredRole2 ?? '',
  adminNotes: m.adminNotes ?? '',
  isMaintainer: !!m.isMaintainer,
  isPreview: !!m.isPreviewAccount,
});

const chunk = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function upsertAttendance(
  rows: { memberId: string; subEventId: string; status: string; reason?: string; byAdmin?: boolean }[],
) {
  for (const batch of chunk(rows)) {
    await zite.attendance.bulkCreate({
      records: batch.map((r) => ({
        attendanceKey: `${r.memberId}:${r.subEventId}`,
        member: r.memberId,
        subEvent: r.subEventId,
        status: r.status,
        reason: r.reason ?? '',
        enteredByAdmin: !!r.byAdmin,
      })) as never,
      matchOn: ['attendanceKey'],
    });
  }
}

/**
 * Keeps "Not Attending Event" in sync: a sub-event is auto-marked for a member
 * when they answered "No" to every show it belongs to, and the auto mark is
 * cleared when that stops being true.
 */
export async function syncAutoAttendance(scope: { memberId?: string; subEventId?: string }) {
  const [{ records: subs }, { records: resps }, { records: att }] = await Promise.all([
    scope.subEventId
      ? zite.subEvents.findOne({ id: scope.subEventId }).then((r) => ({ records: r ? [r] : [] }))
      : zite.subEvents.findAll({ limit: 2000 }),
    scope.memberId
      ? zite.showResponses.findAll({ filters: { member: scope.memberId }, limit: 2000 })
      : zite.showResponses.findAll({ limit: 2000 }),
    scope.memberId
      ? zite.attendance.findAll({ filters: { member: scope.memberId }, limit: 2000 })
      : scope.subEventId
        ? zite.attendance.findAll({ filters: { subEvent: scope.subEventId }, limit: 2000 })
        : zite.attendance.findAll({ limit: 2000 }),
  ]);
  let memberIds: string[];
  if (scope.memberId) memberIds = [scope.memberId];
  else memberIds = (await zite.crewMembers.findAll({ limit: 2000 })).records.map((m) => m.id);

  const respMap = new Map(resps.map((r) => [`${ids(r.member)[0]}:${ids(r.show)[0]}`, r.response]));
  const attMap = new Map(att.map((a) => [`${ids(a.member)[0]}:${ids(a.subEvent)[0]}`, a]));
  const toSet: Parameters<typeof upsertAttendance>[0] = [];
  const toDelete: string[] = [];
  for (const s of subs) {
    const showIds = ids(s.shows);
    if (!showIds.length) continue;
    for (const mid of memberIds) {
      const declined = showIds.every((sh) => respMap.get(`${mid}:${sh}`) === 'No');
      const existing = attMap.get(`${mid}:${s.id}`);
      if (declined && existing?.status !== 'Not Attending Event')
        toSet.push({ memberId: mid, subEventId: s.id, status: 'Not Attending Event', reason: 'Not taking part in this show' });
      if (!declined && existing?.status === 'Not Attending Event') toDelete.push(existing.id);
    }
  }
  await upsertAttendance(toSet);
  for (const id of toDelete) await zite.attendance.delete({ id });
}
