import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { getPublicParents } from '#api';
import { CalendarDays, Clapperboard, Clock, Sparkles, Ticket } from 'lucide-react';
import { SCHOOL } from '../../lib/constants';
import PublicLayout from '../../components/public/PublicLayout';

type Show = { id: string; name: string; description: string };
type Event = {
  id: string; title: string; type: string; date: string | null; dateTbc: boolean;
  meetTime: string; startTime: string | null; endTime: string | null; showNames: string[];
};

/** "Tuesday 14 October" */
const longDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** The season at a glance: every public production and the dates under it. */
export default function Productions() {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let live = true;
    getPublicParents({})
      .then((d: any) => {
        if (!live) return;
        setShows((d.shows as Show[]) ?? []);
        setEvents((d.events as Event[]) ?? []);
      })
      .catch(() => { if (live) setShows([]); });
    return () => { live = false; };
  }, []);

  const byShow = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      for (const name of e.showNames) {
        const list = map.get(name) ?? [];
        list.push(e);
        map.set(name, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    }
    return map;
  }, [events]);

  const perfCount = (list: Event[]) => list.filter((e) => e.type === 'Performance').length;
  const rehearsalCount = (list: Event[]) => list.filter((e) => e.type !== 'Performance').length;

  return (
    <PublicLayout>
      <section className="px-4 pb-10 pt-14 sm:pt-20">
        <div className="mx-auto max-w-6xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Clapperboard className="h-3.5 w-3.5" /> Productions
          </span>
          <h1 className="mt-4 text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            What we are working on.
          </h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            Every production {SCHOOL} is running, with the dates we are on stage. Rehearsal dates live on the
            {' '}<Link to="/calendar" className="text-primary underline underline-offset-4">public calendar</Link>.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl space-y-6">
          {shows === null && <Skeleton className="h-64 rounded-3xl" />}

          {shows !== null && shows.length === 0 && (
            <div className="rounded-3xl border bg-card p-10 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-semibold">The next season is being planned</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Productions will appear here once they are confirmed.
              </p>
            </div>
          )}

          {shows !== null && shows.map((s) => {
            const list = byShow.get(s.name) ?? [];
            const perfs = list.filter((e) => e.type === 'Performance' && e.date);
            return (
              <div key={s.id} className="grid gap-6 rounded-3xl border bg-card p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr]">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{s.name}</h2>
                  {s.description && <p className="mt-3 max-w-prose leading-relaxed text-muted-foreground">{s.description}</p>}
                  <div className="mt-5 flex flex-wrap gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5">
                      <Ticket className="h-4 w-4 text-pink-400" /> {perfCount(list)} performance{perfCount(list) === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5">
                      <Clock className="h-4 w-4 text-sky-400" /> {rehearsalCount(list)} rehearsal{rehearsalCount(list) === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border bg-background/50 p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">On stage</h3>
                  {perfs.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Dates to be confirmed.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {perfs.map((e) => (
                        <li key={e.id} className="flex items-start gap-2.5 rounded-xl border border-pink-500/25 bg-pink-500/5 px-3.5 py-2.5">
                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />
                          <div>
                            <p className="text-sm font-medium">{longDate(e.date!)}</p>
                            <p className="text-xs text-muted-foreground">
                              {e.title}{e.meetTime ? ` · meet ${e.meetTime}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8">
            <div>
              <p className="text-xl font-bold tracking-tight">Want the exact dates?</p>
              <p className="mt-1 text-sm text-muted-foreground">The public calendar has every rehearsal and performance.</p>
            </div>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link to="/calendar"><CalendarDays className="mr-2 h-4 w-4" /> Open the calendar</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
