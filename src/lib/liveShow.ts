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
  updatedAt: l.updatedAt ?? null,
});

/** Scenes for a live show in running order. Shared by every read path. */
export async function loadLiveShowScenes(liveShowId: string) {
  const { records } = await zite.liveShowScenes.findAll({ filters: { liveShowId }, limit: 500 });
  return records.map(mapScene).sort((a, b) => a.sortIndex - b.sortIndex);
}

export const loadLiveShowScripts = async (liveShowId: string, authorId?: string, isAdmin = false) => {
  const { records } = await zite.liveShowScripts.findAll({ filters: { liveShowId }, limit: 500 });
  const shared = records.find((r) => r.scope === 'shared');
  return {
    shared: shared?.content ?? '',
    private: authorId ? (records.find((r) => r.scope === 'private' && ids(r.authorId)[0] === authorId)?.content ?? '') : '',
    sharedLink: shared?.sharedLink ?? '',
    // The licensed private link is for maintainers only; never hand it to crew.
    privateLink: isAdmin ? (shared?.privateLink ?? '') : '',
  };
};

/** The single show an admin has opened tonight, if any. */
export async function openLiveShow() {
  return zite.liveShows.findOne({ filters: { open: true } });
}