import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@project/components/ui/button';
import { CalendarDays, Check, ChevronDown, Clapperboard, Mail, Lightbulb, Mic, Users, LifeBuoy } from 'lucide-react';
import { PLATFORM, SCHOOL, ROLES } from '../lib/constants';
import { SignInPanel } from '../components/LoginScreen';
import LoginCat from '../components/LoginCat';

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
    body: 'Coming, maybe, or not this time. Your crew sees the answer immediately, and the running order fills itself in.',
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

export default function Landing() {
  const [showSignIn, setShowSignIn] = useState(false);
  const still = useReducedMotion();

  // Landing replaces the whole app when you sign out, so the browser happily
  // restores the scroll offset you had on the page before and drops you at the
  // bottom of the footer. This page is an entry point: it always starts at the top.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'auto';
    };
  }, []);

  const goSignIn = () => {
    setShowSignIn(true);
    document.getElementById('signin')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/15">
              <Lightbulb className="h-5 w-5 text-primary" />
            </span>
            {PLATFORM}
          </div>
          <Button onClick={goSignIn} className="h-10 rounded-full px-5">
            Sign in
          </Button>
        </div>
      </header>

      <section className="overflow-hidden px-4 pb-20 pt-14 sm:pt-20">
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-6">
            <Reveal>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {SCHOOL}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
                The crew hub for the whole show.
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-prose text-lg leading-relaxed text-muted-foreground">
                {SCHOOL} runs its productions out of group chats and good intentions. {PLATFORM} puts the events,
                the people, the roles and the reminders somewhere everyone can actually find, so the work gets done
                instead of announced.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={goSignIn} className="h-13 px-8 text-base">
                  Sign in with your school email
                </Button>
                <Button asChild variant="outline" className="h-13 px-6 text-base">
                  <a href="/calendar">Public calendar</a>
                </Button>
                <span className="text-sm text-muted-foreground">No password. A link lands in your inbox.</span>
              </div>
            </Reveal>
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

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
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

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
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

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="grid gap-6 rounded-3xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  <CalendarDays className="h-3.5 w-3.5" />
                  No account needed
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
                    <a href="/calendar">View the public calendar</a>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                    <a href="#signin">I am crew, sign in</a>
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

      <section id="signin" className="px-4 pb-24">
        <div className="mx-auto max-w-md">
          <Reveal>
            <div className="rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
              <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
                <p className="mt-1 text-sm text-muted-foreground">Type your address once. That is the whole form.</p>
              </div>
              <SignInPanel onSent={() => undefined} />
              {!showSignIn && (
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Only crew on the list can sign in. Ask an admin to add you.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {PLATFORM} · {SCHOOL}
          </p>
          <p>Built by the crew, for the crew.</p>
        </div>
      </footer>

      <style>{`@keyframes landing-spin { to { rotate: 360deg; } }`}</style>
      <LoginCat />
    </div>
  );
}
