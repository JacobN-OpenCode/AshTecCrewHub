import { useEffect, useMemo, useState } from 'react';
import { getPublicParents } from '#api';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  CalendarDays, Clock, HeartHandshake, Mail, MapPin, Package, Info, LogIn,
} from 'lucide-react';
import { PLATFORM, SCHOOL } from '../lib/constants';
import { formatEventTimeRange } from '../lib/icsBuild';
import LoginCat from '../components/LoginCat';

type PublicShow = {
  id: string;
  name: string;
  description: string;
};

type PublicEvent = {
  id: string;
  title: string;
  type: string;
  subtype: string;
  date: string | null;
  dateTbc: boolean;
  startTime: string | null;
  endTime: string | null;
  meetTime: string;
  description: string;
  thingsToBring: string;
  responseDueDate: string | null;
  dueDateUnknown: boolean;
  showNames: string[];
};

/** "Tuesday 14 October" */
const niceDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
};

const longDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

/**
 * The public parents page. No account, deliberately.
 *
 * The paper letter this replaces already put descriptions, what to bring and
 * reply-by dates in parents' hands, so withholding them here only ever made
 * the letter stale. Everything below is what a parent needs to plan a term;
 * nothing about individual crew members, attendance or responses appears.
 *
 * Rendered two ways: standalone with its own header for anyone signed out
 * (the link parents are given), and with `inShell` inside the crew app for
 * signed-in members who open it from the sidebar, so the page does not throw
 * away their navigation.
 */
export default function PublicParents({ inShell = false }: { inShell?: boolean }) {
  const [shows, setShows] = useState<PublicShow[] | null>(null);
  const [events, setEvents] = useState<PublicEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    getPublicParents({})
      .then((d: any) => {
        if (!live) return;
        setShows((d.shows as PublicShow[]) ?? []);
        setEvents((d.events as PublicEvent[]) ?? []);
      })
      .catch(() => {
        if (live) {
          setShows([]);
          setEvents([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const { grouped, tbc, past } = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const map = new Map<string, PublicEvent[]>();
    const undated: PublicEvent[] = [];
    for (const e of events ?? []) {
      if (!e.date) {
        undated.push(e);
        continue;
      }
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    const days = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => [
        date,
        list.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')),
      ] as const);
    return {
      grouped: days.filter(([d]) => d >= todayKey),
      // "Date TBC" is a real thing the letter promises parents, so it gets its
      // own list rather than being dropped or mixed in with dated events.
      tbc: undated,
      past: days.filter(([d]) => d < todayKey),
    };
  }, [events]);

  const loading = events === null;

  const Row = ({ e, tbc: isTbc }: { e: PublicEvent; tbc?: boolean }) => (
    <li
      className={
        'rounded-xl border p-4 ' +
        (e.type === 'Performance'
          ? 'border-pink-500/30 bg-pink-500/5'
          : 'border-sky-500/30 bg-sky-500/5')
      }
    >
      <p className="font-semibold leading-tight">
        {e.title}
        {isTbc && (
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
            Date TBC
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {e.subtype || e.type}
        {e.showNames.length > 0 && ` · ${e.showNames.join(', ')}`}
      </p>

      {(e.startTime || e.endTime) && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5 font-mono">
          <span className="text-primary">●</span> {formatEventTimeRange(e.startTime, e.endTime)}
        </p>
      )}
      {e.meetTime && (
        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" /> Meet {e.meetTime}
        </p>
      )}
      {e.description && (
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{e.description}</p>
      )}
      {e.thingsToBring && (
        <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
          <Package className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            <strong className="text-foreground">What to bring:</strong> {e.thingsToBring}
          </span>
        </p>
      )}
      {(e.responseDueDate || e.dueDateUnknown) && (
        <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            <strong className="text-foreground">Reply by:</strong>{' '}
            {e.responseDueDate ? longDate(e.responseDueDate) : 'to be confirmed'}
          </span>
        </p>
      )}
    </li>
  );

  const Section = ({
    title,
    rows,
    muted,
  }: {
    title: string;
    rows: readonly (readonly [string, PublicEvent[]])[];
    muted?: boolean;
  }) =>
    rows.length === 0 ? null : (
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {rows.map(([date, list]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-lg font-bold tracking-tight">{niceDate(date)}</h3>
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
      {!inShell && (
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <div className="flex items-center gap-2.5 font-bold tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
                <HeartHandshake className="h-5 w-5 text-primary" />
              </span>
              {PLATFORM}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <a href="/calendar">Public calendar</a>
              </Button>
              <Button size="sm" asChild>
                <a href="/">
                  <LogIn className="mr-2 h-4 w-4" />
                  Home
                </a>
              </Button>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 space-y-10">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            For parents &amp; guardians
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            Everything AshTec, in one place.
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground max-w-prose">
            Every rehearsal and performance {SCHOOL} has coming up, what to bring, when to reply,
            and what each production is. No account needed, and it never expires &ndash; this page
            reads from the same list the stage manager uses.
          </p>
        </div>

        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What is AshTec?
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            {SCHOOL}&rsquo;s AshTec Crew is the technical theatre team that runs the school&rsquo;s
            productions &ndash; lighting, sound, staging, and the support that the performers,
            directors and audiences never see but cannot do without.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Participation is voluntary.</strong> Every student is
            welcome to come to as much or as little as their school work and energy allows. The
            productions are an incredible experience: students learn what really goes into a theatre
            show, work alongside older pupils and teachers, and end up with a generous line on their
            creative CV.
          </p>
        </section>

        {loading && <Skeleton className="h-64 rounded-2xl" />}

        {!loading && (shows ?? []).length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Productions
            </h2>
            <div className="space-y-3">
              {(shows ?? []).map((s) => (
                <div key={s.id} className="rounded-xl border bg-card p-5">
                  <p className="font-bold tracking-tight">{s.name}</p>
                  {s.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && <Skeleton className="h-48 rounded-2xl" />}

        {!loading && grouped.length === 0 && (events ?? []).length === 0 && (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-semibold">Nothing in the diary yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once dates are confirmed they will show up here.
            </p>
          </div>
        )}

        {grouped.length > 0 && <Section title="Coming up" rows={grouped} />}

        {tbc.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dates still to be confirmed
            </h2>
            <ul className="space-y-2">
              {tbc.map((e) => (
                <Row key={e.id} e={e} tbc />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && <Section title="Already happened" rows={past.slice(0, 10)} muted />}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Absence &amp; questions
          </h2>
          <div className="rounded-xl border bg-card p-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              If your child is unable to attend a specific rehearsal or performance, please let a
              crew admin know as far in advance as possible so the running order can be planned
              around it.
            </p>
            <p>
              For any question about a production, contact <strong className="text-foreground">Mr
              Andrews</strong>, Head of Drama at the school. He oversees the productions and is the
              right person to talk to first.
            </p>
          </div>
        </section>

        {!inShell && (
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
        )}

        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          This page carries the detail parents were given in the letter. Crew-only material, such as
          attendance, member responses and internal notes, is not shown here. For dates and times
          only, see the <a href="/calendar" className="text-primary underline underline-offset-4">public calendar</a>.
        </p>
      </main>

      {!inShell && (
        <>
          <footer className="border-t px-4 py-8">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                {PLATFORM} · {SCHOOL}
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                East Hill, Ashford, Kent, TN24 8PB
              </p>
            </div>
          </footer>
          <LoginCat />
        </>
      )}
    </div>
  );
}
