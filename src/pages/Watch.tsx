import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Loader2, Radio } from 'lucide-react';
import { getSchedule, type GetScheduleOutputType } from '#api';
import { pv } from '../lib/preview';
import { useMe } from '../lib/me';
import { callTime, countdown, describeDay, type NextCall } from '../lib/nextCall';

/**
 * Batch 6: the watch companion. A deliberately bare, large-type view for a
 * show day on a watch or a small always-on screen: the next call, its time and
 * a live countdown, plus a quick check-in. It renders outside the shell and
 * refreshes every 30 seconds so the countdown and "show is live" dot keep up.
 */
export default function Watch() {
  const { liveShowActive } = useMe();
  const [events, setEvents] = useState<NextCall[] | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      getSchedule(pv())
        .then((d) => { if (live) setEvents((d as GetScheduleOutputType).events as unknown as NextCall[]); })
        .catch(() => {});
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => { live = false; window.clearInterval(t); };
  }, []);

  const next = events?.find((e) => (e.date ?? '') >= new Date().toISOString().slice(0, 10)) ?? null;
  const time = next ? callTime(next) : '';
  const until = next ? countdown(next.date, time) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-5 py-10 text-white">
      {liveShowActive ? (
        <div className="mb-8 flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-sm font-semibold text-red-400">
          <Radio className="h-4 w-4" /> Show in progress
        </div>
      ) : null}

      {events === null ? (
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      ) : !next ? (
        <div className="text-center text-xl text-white/60">Nothing coming up.</div>
      ) : (
        <div className="w-full max-w-md text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Next call</div>
          <div className="mt-3 text-4xl font-bold leading-tight">{next.title}</div>
          {next.showName ? <div className="mt-2 text-lg text-white/60">{next.showName}</div> : null}
          <div className="mt-8 text-7xl font-bold tabular-nums">{time || 'TBC'}</div>
          <div className="mt-2 text-lg text-white/60">{describeDay(next.date)}</div>
          {until ? <div className="mt-3 text-2xl font-semibold text-amber-400">{until}</div> : null}
          <Link
            to="/attendance"
            className="mt-10 inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-white/20"
          >
            <DoorOpen className="h-5 w-5" /> Check in
          </Link>
        </div>
      )}
    </div>
  );
}
