// Backend-only helpers for the Live Show feature (ticket 0cdcd997).
// Shared between the admin wiring, the public /show-dash state and the
// member dashboard so they all agree on shapes and on how the clock works.
import { zite } from '#db';
import type { AnyRecord } from '#db';
import { ids } from './server';

export const LIVE_SHOW_STATUSES = ['standby', 'rehearsal', 'live', 'intermission', 'finished'] as const;
export type LiveShowStatus = (typeof LIVE_SHOW_STATUSES)[number];

export const isLiveShowStatus = (s?: string | null): s is LiveShowStatus =>
  !!s && (LIVE_SHOW_STATUSES as readonly string[]).includes(s);

/**
 * The show clock, server-authoritative and computable at any moment. While the
 * timer is running the elapsed is the accumulated base plus the wall time since
 * the current start; while stopped it is just the accumulated base. The
 * dashboard ticks locally between polls, so this must stay a pure function.
 */
export const liveShowElapsedMs = (l: AnyRecord, now = Date.now()): number => {
  const base = Number(l.timerElapsedMs ?? 0);
  if (l.timerMode === 'running' && l.timerStartAt) {
    const start = new Date(l.timerStartAt).getTime();
    if (Number.isFinite(start)) return base + Math.max(0, now - start);
  }
  return base;
};

export const mapScene = (s: AnyRecord) => ({
  id: s.id,
  label: s.label ?? '',
  title: s.title ?? '',
  minutes: Number(s.minutes ?? 0),
  cast: Array.isArray(s.cast) ? s.cast : [],
  props: Array.isArray(s.props) ? s.props : [],
  notes: Array.isArray(s.notes) ? s.notes : [],
  sortIndex: Number(s.sortIndex ?? 0),
});

/** The same shape admins and members see; the public endpoint strips it down. */
export const mapLiveShow = (l: AnyRecord) => ({
  id: l.id,
  showId: l.showId ?? null,
  name: l.name ?? '',
  areaName: l.areaName ?? 'Stage',
  status: isLiveShowStatus(l.status) ? l.status : 'standby',
  open: !!l.open,
  code: l.code ?? '',
  intermissionMinutes: Number(l.intermissionMinutes ?? 15),
  timerMode: l.timerMode === 'running' ? 'running' : 'stopped',
  timerStartAt: l.timerStartAt ?? null,
  timerElapsedMs: Number(l.timerElapsedMs ?? 0),
  currentSceneIndex: Number(l.currentSceneIndex ?? 0),
  crewCanEdit: !!l.crewCanEdit,
  movementAlert: !!l.movementAlert,
  movementMessage: l.movementMessage ?? '',
  movementSeconds: Number(l.movementSeconds ?? 30),
  movementAdmins: ids(l.movementAdmins),
  updatedAt: l.updatedAt ?? null,
});

export const mapDevice = (d: AnyRecord) => ({
  id: d.id,
  deviceKey: d.deviceKey ?? '',
  name: d.name ?? '',
  platform: d.platform ?? '',
  member: ids(d.member)[0] ?? null,
  online: !!d.online,
  adminView: !!d.adminView,
  lastSeenAt: d.lastSeenAt ?? null,
  lastMovementAt: d.lastMovementAt ?? null,
});

export const mapMessage = (m: AnyRecord) => ({
  id: m.id,
  author: ids(m.author)[0] ?? null,
  authorName: m.authorName ?? '',
  body: m.body ?? '',
  kind: m.kind ?? 'chat',
  createdAt: m.createdAt ?? null,
});

export const mapAnnouncement = (a: AnyRecord) => ({
  id: a.id,
  body: a.body ?? '',
  authorName: a.authorName ?? '',
  seconds: Number(a.seconds ?? 0),
  expiresAt: a.expiresAt ?? null,
  createdAt: a.createdAt ?? null,
});

/** Devices currently watching a show, newest activity first. */
export async function loadLiveShowDevices(liveShowId: string) {
  const { records } = await zite.liveShowDevices.findAll({ filters: { liveShowId }, limit: 500 });
  return records.map(mapDevice).sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
}

export async function loadLiveShowMessages(liveShowId: string, limit = 60) {
  const { records } = await zite.liveShowMessages.findAll({ filters: { liveShowId }, limit: 500 });
  return records
    .map(mapMessage)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-limit);
}

/** Announcements still on the board: not cleared and not past their expiry. */
export async function activeAnnouncements(liveShowId: string, now = Date.now()) {
  const { records } = await zite.liveShowAnnouncements.findAll({ filters: { liveShowId }, limit: 200 });
  return records
    .filter((a) => !a.clearedAt)
    .filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > now)
    .map(mapAnnouncement)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Register or refresh a watching device. deviceKey is minted client-side and
 * stored in localStorage, so a reconnect updates the same row instead of
 * inventing a new device every poll. `online` is set true; a device is treated
 * as offline elsewhere once lastSeenAt goes stale.
 */
export async function touchLiveShowDevice(liveShowId: string, input: AnyRecord) {
  const deviceKey = String(input.deviceKey ?? '').slice(0, 120);
  if (!deviceKey) return undefined;
  const existing = await zite.liveShowDevices.findOne({ filters: { liveShowId, deviceKey } });
  const patch: AnyRecord = {
    name: String(input.name ?? '').slice(0, 120),
    platform: String(input.platform ?? '').slice(0, 60),
    userAgent: String(input.userAgent ?? '').slice(0, 400),
    member: input.member ?? null,
    online: true,
    adminView: !!input.adminView,
    lastSeenAt: new Date().toISOString(),
  };
  if (existing) return zite.liveShowDevices.update({ id: String(existing.id), record: patch });
  return zite.liveShowDevices.create({ record: { liveShowId, deviceKey, ...patch } });
}

/** Scenes for a live show in running order. Shared by every read path. */
export async function loadLiveShowScenes(liveShowId: string) {
  const { records } = await zite.liveShowScenes.findAll({ filters: { liveShowId }, limit: 500 });
  return records.map(mapScene).sort((a, b) => a.sortIndex - b.sortIndex);
}

/**
 * The show script is a single OneDrive link (ticket f75f7b40): no pasted text,
 * no separate private copy. Everyone who can see the script sees the same link.
 */
export const loadLiveShowScripts = async (liveShowId: string) => {
  const { records } = await zite.liveShowScripts.findAll({ filters: { liveShowId }, limit: 500 });
  const shared = records.find((r) => r.scope === 'shared');
  return { sharedLink: shared?.sharedLink ?? '' };
};

/** The single show an admin has opened tonight, if any. */
export async function openLiveShow() {
  return zite.liveShows.findOne({ filters: { open: true } });
}