import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@project/components/ui/button';
import { getPublicCalendar, getPublicParents } from '#api';
import {
  CalendarDays, Check, ChevronDown, Clapperboard, Clock, LifeBuoy, Lightbulb, Mail, MapPin,
  Mic, Music, Sparkles, Star, Ticket, Users,
} from 'lucide-react';
import { PLATFORM, SCHOOL, ROLES } from '../../lib/constants';
import PublicLayout from '../../components/public/PublicLayout';

/** A twelve-lobed blob, drawn slow-rotating behind the hero. */
const BLOB =
  'M102.8,50.0 102.2,54.6 100.6,58.9 98.3,62.9 95.7,66.6 93.2,70.1 90.9,73.6 89.0,77.3 87.2,81.3 85.4,85.4 83.0,89.4 80.0,92.9 76.4,95.7 72.1,97.5 67.6,98.3 62.9,98.3 58.4,97.9 54.2,97.4 50.0,97.2 45.8,97.4 41.6,97.9 37.1,98.3 32.4,98.3 27.9,97.5 23.6,95.7 20.0,92.9 17.0,89.4 14.6,85.4 12.8,81.3 11.0,77.3 9.1,73.6 6.8,70.1 4.3,66.6 1.7,62.9 -0.6,58.9 -2.2,54.6 -2.8,50.0 -2.2,45.4 -0.6,41.1 1.7,37.1 4.3,33.4 6.8,29.9 9.1,26.4 11.0,22.7 12.8,18.7 14.6,14.6 17.0,10.6 20.0,7.1 23.6,4.3 27.9,2.5 32.4,1.7 37.1,1.7 41.6,2.1 45.8,2.6 50.0,2.8 54.2,2.6 58.4,2.1 62.9,1.7 67.6,1.7 72.1,2.5 76.4,4.3 80.0,7.1 83.0,10.6 85.4,14.6 87.2,18.7 89.0,22.7 90.9,26.4 93.2,29.9 95.7,33.4 98.3,37.1 100.6,41.1 102.2,45.4Z';

const THINGS = [
  {
    icon: Clapperboard,
    title: 'Every event in one place',
    body: 'Rehearsals and performances with the call time, the venue, and who is needed. No more digging through group chats.',
  },
  {
    icon: Users,
    title: 'Say yes in one tap',
    body: 'Coming, maybe, or not this time. The crew sees the answer immediately, and the running order fills itself in.',
  },
  {
    icon: Mic,
    title: 'Built around the crew',
    body: `Roles for ${ROLES.join(', ').toLowerCase()}, so the people doing the work are the people getting told about it.`,
  },
  {
    icon: Mail,
    title: 'Reminders that arrive',
    body: 'Deadline nudges go out on their own. Admins can see what was sent, and the crew never has to chase a date.',
  },
  {
    icon: CalendarDays,
    title: 'The month at a glance',
    body: 'A shared calendar for the whole school, so a clash is obvious before it becomes a panic.',
  },
  {
    icon: LifeBuoy,
    title: 'Tell us when it is broken',
    body: 'Report a bug or ask for something from inside the app, and follow the reply in the same thread.',
  },
];

/** Three steps, in the order a new crew member actually does them. */
const STEPS = [
  {
    n: '01',
    title: 'Put your email in',
    body: 'Sign in with your school address. No password to invent or forget, and no account to sign up for.',
  },
  {
    n: '02',
    title: 'Check what is on',
    body: 'Your dates, your call times, and anything you still owe an answer on, waiting the moment you land.',
  },
  {
    n: '03',
    title: 'Reply and let it run',
    body: 'Tap coming, maybe or no. Heads of department see the answer straight away and chase whoever has not replied.',
  },
];

const FAQ = [
  {
    q: 'I am not on the crew list. Can I still see anything?',
    a: 'Yes. The public calendar shows every rehearsal and performance with its date and meet time, so parents, teachers and staff can plan without an account.',
  },
  {
    q: 'What can the public calendar see?',
    a: 'Titles, dates, meet times and which show an event belongs to. Descriptions, run times, what to bring and response deadlines stay behind sign-in.',
  },
  {
    q: 'Can I put the dates in my own calendar?',
    a: 'Yes. Once you are signed in, your profile has a button that downloads your dates as an .ics file for Apple Calendar, Google Calendar or Outlook.',
  },
  {
    q: 'I moved up a year or changed my name. Can I fix it myself?',
    a: 'Your name, year and role preferences are yours to edit. Crew roles and staff status stay with the admins so nobody can promote themselves onto a show.',
  },
];

type CalEvent = {
  id: string; title: string; type: string; subtype: string;
  date: string; meetTime: string; startTime: string | null; endTime: string | null; showNames: string[];
};
type ParentShow = { id: string; name: string; description: string };
type ParentEvent = { id: string; title: string; type: string; date: string | null; dateTbc: boolean; showNames: string[] };

/** "Tue 14 Oct" from a local YYYY-MM-DD. */
const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const still = useReducedMotion();
  if (still) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const still = useReducedMotion();
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [shows, setShows] = useState<ParentShow[] | null>(null);
  const [seasonEvents, setSeasonEvents] = useState<ParentEvent[]>([]);

  useEffect(() => {
    // The landing page replaces the whole app on sign-out, so the browser
    // otherwise restores the previous scroll offset and drops you at the
    // footer. This page is an entry point: it always starts at the top.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'auto';
    };
  }, []);

  useEffect(() => {
    let live = true;
    getPublicCalendar({})
      .then((d: any) => { if (live) setEvents((d.events as CalEvent[]) ?? []); })
      .catch(() => { if (live) setEvents([]); });
    getPublicParents({})
      .then((d: any) => {
        if (!live) return;
        setShows((d.shows as ParentShow[]) ?? []);
        setSeasonEvents((d.events as ParentEvent[]) ?? []);
      })
      .catch(() => { if (live) setShows([]); });
    return () => { live = false; };
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const upNext = useMemo(
    () => (events ?? []).filter((e) => e.date >= today).sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? ''))).slice(0, 4),
    [events, today],
  );

  const stats = useMemo(() => ({
    productions: shows?.length ?? 0,
    dates: events?.length ?? 0,
    performances: (events ?? []).filter((e) => e.type === 'Performance').length,
  }), [shows, events]);

  // The next few performances, so the season strip leads with what is on soon.
  const nextShows = useMemo(() => {
    const perfDates = new Map<string, string[]>();
    for (const e of seasonEvents) {
      if (e.type !== 'Performance' || !e.date) continue;
      for (const name of e.showNames) {
        const list = perfDates.get(name) ?? [];
        list.push(e.date);
        perfDates.set(name, list);
      }
    }
    return (shows ?? []).slice(0, 6).map((s) => ({
      ...s,
      performances: (perfDates.get(s.name) ?? []).sort(),
    }));
  }, [shows, seasonEvents]);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-30%] h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(236,55,80,0.35), transparent 70%)' }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {SCHOOL}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                We run the <span className="text-primary">show</span>.
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
                Lights, sound, mics and follow spots, run by students for every production at {SCHOOL.split(' Tech')[0]}.
                {' '}{PLATFORM} is where the crew keeps its dates, its roles and its reminders, so the work gets done
                instead of announced.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild className="h-12 rounded-full px-7 text-base">
                  <Link to="/calendar">
                    <CalendarDays className="mr-2 h-4 w-4" /> See what is on
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full px-6 text-base">
                  <Link to="/join">Join the crew</Link>
                </Button>
              </div>
            </Reveal>
            {stats.dates > 0 && (
              <Reveal delay={0.2}>
                <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
                  {[
                    { v: stats.productions, l: 'productions' },
                    { v: stats.performances, l: 'performances' },
                    { v: stats.dates, l: 'dates in the diary' },
                  ].map((s) => (
                    <div key={s.l}>
                      <dt className="text-3xl font-extrabold tracking-tight text-primary">{s.v}</dt>
                      <dd className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}
          </div>

          <Reveal delay={0.1}>
            <div className="relative mx-auto grid aspect-square w-full max-w-md place-items-center">
              <svg
                viewBox="0 0 104 104"
                className="absolute inset-0 h-full w-full fill-primary/15"
                style={still ? undefined : { animation: 'landing-spin 90s linear infinite' }}
                aria-hidden="true"
              >
                <path d={BLOB} />
              </svg>
              <img
                src="/cat.png"
                alt="The AshTec crew cat"
                width={240}
                height={248}
                className="relative w-3/5 drop-shadow-2xl"
                draggable={false}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Up next */}
      {upNext.length > 0 && (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Clock className="h-3.5 w-3.5" /> Up next
                  </span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">On soon</h2>
                </div>
                <Link to="/calendar" className="text-sm font-medium text-primary hover:underline">Full calendar →</Link>
              </div>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {upNext.map((e, i) => (
                <Reveal key={e.id} delay={i * 0.05}>
                  <div className={
                    'h-full rounded-2xl border p-5 ' +
                    (e.type === 'Performance' ? 'border-pink-500/30 bg-pink-500/5' : 'border-sky-500/30 bg-sky-500/5')
                  }>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {e.type === 'Performance' ? 'Performance' : (e.subtype || e.type)}
                    </p>
                    <p className="mt-2 font-semibold leading-tight">{e.title}</p>
                    {e.showNames.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{e.showNames.join(', ')}</p>}
                    <p className="mt-3 flex items-center gap-1.5 text-sm font-medium">
                      <CalendarDays className="h-4 w-4 text-primary" /> {shortDate(e.date)}
                    </p>
                    {e.meetTime && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> Meet {e.meetTime}
                      </p>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* This season */}
      {nextShows.length > 0 && (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Clapperboard className="h-3.5 w-3.5" /> This season
                  </span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What we are building</h2>
                </div>
                <Link to="/productions" className="text-sm font-medium text-primary hover:underline">All productions →</Link>
              </div>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {nextShows.map((s, i) => (
                <Reveal key={s.id} delay={(i % 3) * 0.06}>
                  <div className="flex h-full flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40">
                    <h3 className="text-xl font-bold tracking-tight">{s.name}</h3>
                    {s.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{s.description}</p>}
                    <div className="mt-4 flex-1" />
                    {s.performances.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {s.performances.slice(0, 4).map((d) => (
                          <span key={d} className="rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-1 text-xs font-medium text-pink-400">
                            {shortDate(d)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Dates to be confirmed</p>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* What we do */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Everything a tech crew needs, and nothing it does not.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {THINGS.map((t, i) => (
              <Reveal key={t.title} delay={(i % 3) * 0.06}>
                <div className="h-full rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                    <t.icon className="h-5 w-5 text-primary" />
                  </span>
                  <h3 className="font-semibold">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="rounded-3xl border bg-card p-6 sm:p-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Star className="h-3.5 w-3.5" /> Departments
                  </span>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Pick your corner of the stage.</h2>
                  <p className="mt-2 max-w-prose text-muted-foreground">
                    There is a job for everyone, whether you want to be on the desk or up a ladder.
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/join">Get involved</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2.5">
                {ROLES.map((r) => (
                  <span key={r} className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-medium">
                    <Music className="h-4 w-4 text-primary" /> {r}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps, then you are on the crew.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.06}>
                <div className="h-full rounded-2xl border bg-card p-5">
                  <span className="font-mono text-sm text-primary">{s.n}</span>
                  <h3 className="mt-2 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Public calendar */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid gap-6 rounded-3xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" /> No account needed
                </span>
                <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                  Not on the crew? Check the dates anyway.
                </h2>
                <p className="mt-3 max-w-prose leading-relaxed text-muted-foreground">
                  Parents, teachers and staff can open the public calendar and see every rehearsal and performance
                  with its date and meet time. Full details, response deadlines and what to bring stay behind
                  sign-in, where they belong.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="rounded-full px-6">
                    <Link to="/calendar">View the public calendar</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                    <Link to="/signin">I am crew, sign in</Link>
                  </Button>
                </div>
              </div>
              <ul className="space-y-2.5 text-sm">
                {['Every rehearsal and performance', 'Date and meet time for each', 'Which show it belongs to', 'Hidden events never listed'].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 rounded-xl border bg-card/60 px-3.5 py-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Questions people actually ask.</h2>
          </Reveal>
          <div className="mt-8 divide-y rounded-2xl border bg-card">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={Math.min(i, 3) * 0.05}>
                <details className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border bg-card p-8 text-center sm:p-14">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 opacity-50 blur-3xl"
                style={{ background: 'radial-gradient(closest-side, rgba(236,55,80,0.35), transparent 70%)' }}
              />
              <div className="relative">
                <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">Ready to help run the show?</h2>
                <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
                  Whether you have run a desk for years or have never touched a lighting rig, there is a place for you.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg" className="rounded-full px-8">
                    <Link to="/join">Join the crew</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full px-8">
                    <Link to="/signin">Crew sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <style>{`@keyframes landing-spin { to { rotate: 360deg; } }`}</style>
    </PublicLayout>
  );
}
