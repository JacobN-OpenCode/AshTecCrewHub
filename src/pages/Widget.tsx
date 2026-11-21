import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, DoorOpen, Loader2, RefreshCw } from 'lucide-react';
import { getSchedule, type GetScheduleOutputType } from '#api';
import { pv } from '../lib/preview';
import { callTime, countdown, describeDay, type NextCall } from '../lib/nextCall';
import { cachedGet } from '../lib/offlineCache';

/**
 * Batch 6: a compact "next call" card, meant to be added to a phone home
 * screen (or opened from the manifest shortcut). It renders outside the shell
 * so it is small and self-contained, and it refreshes on the minute so the
 * countdown stays honest.
 */
export default function Widget() {
  const [events, setEvents] = useState<NextCall[] | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data, stale: s } = await cachedGet('schedule', () => getSchedule(pv()));
      // `data.events[].endTime` is not on the slim shape, so the widget only
      // needs date / start / meet.
      setEvents((data as GetScheduleOutputType).events as unknown as NextCall[]);
      setStale(s);
    } catch {
      /* offline with no cache: the empty state below covers it */
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = events?.find((e) => (e.date ?? '') >= new Date().toISOString().slice(0, 10)) ?? null;
  const time = next ? callTime(next) : '';
  const until = next ? countdown(next.date, time) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">Next call</span>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>

        {events === null ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading your schedule…
          </div>
        ) : !next ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <CalendarDays className="mx-auto mb-2 h-6 w-6 opacity-60" />
            Nothing on your schedule right now.
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold leading-tight">{next.title}</div>
            {next.showName ? <div className="mt-0.5 text-sm text-muted-foreground">{next.showName}</div> : null}
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold">{time || 'Time TBC'}</span>
              <span className="text-sm text-muted-foreground">{describeDay(next.date)}</span>
            </div>
            {until ? <div className="mt-1 text-sm font-medium text-primary">{until}</div> : null}
            <div className="mt-5 flex gap-2">
              <Link
                to="/attendance"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <DoorOpen className="h-4 w-4" /> Check in
              </Link>
              <Link
                to="/schedule"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted/60"
              >
                <CalendarDays className="h-4 w-4" /> Schedule
              </Link>
            </div>
          </>
        )}
        {stale ? <div className="mt-3 text-center text-xs text-amber-400">Offline: showing your last known schedule.</div> : null}
      </div>
    </div>
  );
}
