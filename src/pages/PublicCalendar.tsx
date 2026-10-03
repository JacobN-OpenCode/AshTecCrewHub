import { useEffect, useMemo, useState } from 'react';
import { getPublicCalendar } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { CalendarDays, Clock, Lightbulb, MapPin, LogIn } from 'lucide-react';
import { PLATFORM, SCHOOL } from '../lib/constants';
import LoginCat from '../components/LoginCat';

type PublicEvent = {
  id: string;
  title: string;
  type: string;
  subtype: string;
  date: string;
  meetTime: string;
  showNames: string[];
};

/** Local YYYY-MM-DD. toISOString would shift the day across the UTC boundary. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

/** "Tuesday 14 October" */
const niceDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
};

/**
 * The public calendar. No login, and deliberately thin: dates, meet times, the
 * show name and nothing else. Anything crew-only lives behind getCalendar.
 */
export default function PublicCalendar() {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getPublicCalendar({})
      .then((d: any) => {
        if (!live) return;
        setEvents((d.events as PublicEvent[]) ?? []);
      })
      .catch(() => {
        if (live) {
          setEvents([]);
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  // Group by date, so a busy Saturday reads as one block rather than six rows.
  const grouped = useMemo(() => {
    const map = new Map<string, PublicEvent[]>();
    for (const e of events ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => [date, list.sort((a, b) => a.meetTime.localeCompare(b.meetTime))] as const);
  }, [events]);

  const today = iso(new Date());
  const upcoming = grouped.filter(([date]) => date >= today);
  const past = grouped.filter(([date]) => date < today).reverse();

  const Row = ({ e }: { e: PublicEvent }) => (
    <li
      className={
        'rounded-xl border p-3.5 ' +
        (e.type === 'Performance'
          ? 'border-pink-500/30 bg-pink-500/5'
          : 'border-sky-500/30 bg-sky-500/5')
      }
    >
      <p className="font-semibold leading-tight">{e.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {e.subtype || e.type}
        {e.showNames.length > 0 && ` · ${e.showNames.join(', ')}`}
      </p>
      {e.meetTime && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" /> Meet {e.meetTime}
        </p>
      )}
    </li>
  );

  const Section = ({ title, rows, muted }: { title: string; rows: readonly (readonly [string, PublicEvent[]])[]; muted?: boolean }) =>
    rows.length === 0 ? null : (
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {rows.map(([date, list]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-lg font-bold tracking-tight">{niceDate(date)}</h3>
              {date === today && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Today
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {list.length} event{list.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul className={muted ? 'space-y-2 opacity-60' : 'space-y-2'}>
              {list.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
              <Lightbulb className="h-5 w-5 text-primary" />
            </span>
            {PLATFORM}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href="/">Home</a>
            </Button>
            <Button size="sm" asChild>
              <a href="/">
                <LogIn className="mr-2 h-4 w-4" />
                Crew sign in
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 space-y-10">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            Public calendar
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            When is what on.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground max-w-prose">
            Every rehearsal and performance for {SCHOOL}, open to everyone. No account needed. If you are on the
            crew, <a href="/" className="text-primary underline underline-offset-4">sign in</a> for full details,
            response deadlines and what to bring.
          </p>
        </div>

        {events === null && <Skeleton className="h-64 rounded-2xl" />}

        {events !== null && events.length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-semibold">Nothing in the diary yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once dates are confirmed they will show up here.
            </p>
          </div>
        )}

        {failed && events !== null && events.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            We could not load the calendar just now. Try again shortly.
          </p>
        )}

        {events !== null && events.length > 0 && (
          <>
            <Section title="Coming up" rows={upcoming} />
            {past.length > 0 && <Section title="Already happened" rows={past.slice(0, 10)} muted />}
          </>
        )}

        <div className="rounded-2xl border bg-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">On the crew?</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sign in to respond to events, see run times and get reminders.
            </p>
          </div>
          <Button asChild className="rounded-full px-5">
            <a href="/">Sign in</a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          This page shows dates and meet times only. Full event details, including descriptions and response
          deadlines, are for signed-in crew.
        </p>
      </main>

      <footer className="border-t px-4 py-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {PLATFORM} · {SCHOOL}
          </p>
          <p>Built by the crew, for the crew.</p>
        </div>
      </footer>
      <LoginCat />
    </div>
  );
}