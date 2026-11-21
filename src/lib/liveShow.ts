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
  intermissionMinutes: Number(l.intermissionMinutes ?? 15),
  timerMode: l.timerMode === 'running' ? 'running' : 'stopped',
  timerStartAt: l.timerStartAt ?? null,
  timerElapsedMs: Number(l.timerElapsedMs ?? 0),
  currentSceneIndex: Number(l.currentSceneIndex ?? 0),
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
  userAgent: d.userAgent ?? '',
  member: ids(d.member)[0] ?? null,
  enabled: !!d.enabled,
  online: !!d.online,
  adminView: !!d.adminView,
  movementAlert: !!d.movementAlert,
  movementMessage: d.movementMessage ?? '',
  movementSeconds: Number(d.movementSeconds ?? 30),
  movementAdmins: ids(d.movementAdmins),
  lastSeenAt: d.lastSeenAt ?? null,
  lastMovementAt: d.lastMovementAt ?? null,
  movementAckAt: d.movementAckAt ?? null,
  connectedSince: d.createdAt ?? null,
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

export const mapTouch = (t: AnyRecord) => ({
  id: t.id,
  deviceKey: t.deviceKey ?? '',
  deviceName: t.deviceName ?? '',
  kind: t.kind ?? 'movement',
  createdAt: t.createdAt ?? null,
});

/** The movement-alert config that belongs to one screen. */
export const deviceMovementConfig = (d: AnyRecord) => ({
  alert: !!d.movementAlert,
  message: d.movementMessage ?? '',
  seconds: Number(d.movementSeconds ?? 30) || 30,
  admins: ids(d.movementAdmins),
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

/** The touch log for a show, newest first (who bumped / pressed which screen). */
export async function loadLiveShowTouches(liveShowId: string, limit = 100) {
  const { records } = await zite.liveShowTouches.findAll({ filters: { liveShowId }, limit: 1000 });
  return records
    .map(mapTouch)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
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

/**
 * The show a screen should attach to. Prefers the open show, but before a show
 * is started it falls back to the most recently edited one so screens can be
 * enabled while scenes are still being prepared.
 */
export async function currentLiveShow() {
  const open = await openLiveShow();
  if (open) return open;
  const { records } = await zite.liveShows.findAll({ limit: 200 });
  const candidates = records.filter((l) => l.status !== 'finished');
  candidates.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return candidates[0];
}

/**
 * Heartbeat an already-enabled screen. Only rows that exist (i.e. were enabled)
 * are refreshed: a browser that is merely looking at the board must not appear
 * in the device list. Never touches enabled/movement config.
 */
export async function heartbeatLiveShowDevice(liveShowId: string, input: AnyRecord) {
  const deviceKey = String(input.deviceKey ?? '').slice(0, 120);
  if (!deviceKey) return undefined;
  const existing = await zite.liveShowDevices.findOne({ filters: { liveShowId, deviceKey } });
  if (!existing) return undefined;
  const patch: AnyRecord = {
    platform: String(input.platform ?? '').slice(0, 60),
    userAgent: String(input.userAgent ?? '').slice(0, 400),
    member: input.member ?? existing.member ?? null,
    online: true,
    lastSeenAt: new Date().toISOString(),
  };
  if (input.name) patch.name = String(input.name).slice(0, 120);
  return zite.liveShowDevices.update({ id: String(existing.id), record: patch });
}

/**
 * Enable (or re-enable, e.g. after a rename) a screen for a show. Movement
 * config is seeded from the show's defaults ONLY when the row is first created,
 * so a later show-config change never clobbers a screen's own customisation.
 */
export async function enableLiveShowDevice(liveShow: AnyRecord, input: AnyRecord) {
  const deviceKey = String(input.deviceKey ?? '').slice(0, 120);
  if (!deviceKey) return undefined;
  const liveShowId = String(liveShow.id);
  const existing = await zite.liveShowDevices.findOne({ filters: { liveShowId, deviceKey } });
  const base: AnyRecord = {
    name: String(input.name ?? '').slice(0, 120),
    platform: String(input.platform ?? '').slice(0, 60),
    userAgent: String(input.userAgent ?? '').slice(0, 400),
    member: input.member ?? null,
    enabled: true,
    online: true,
    lastSeenAt: new Date().toISOString(),
  };
  if (existing) return zite.liveShowDevices.update({ id: String(existing.id), record: base });
  return zite.liveShowDevices.create({
    record: {
      liveShowId,
      deviceKey,
      ...base,
      movementAlert: !!liveShow.movementAlert,
      movementMessage: liveShow.movementMessage ?? '',
      movementSeconds: Number(liveShow.movementSeconds ?? 30) || 30,
      movementAdmins: ids(liveShow.movementAdmins),
    },
  });
}
