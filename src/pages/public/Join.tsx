import { Link } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import {
  CalendarDays, Check, Mail, MessageCircle, Sparkles, Star, UserPlus, Users,
} from 'lucide-react';
import { SCHOOL, WHATSAPP_COMMUNITY_URL } from '../../lib/constants';
import PublicLayout from '../../components/public/PublicLayout';

const OFFER = [
  { icon: Star, title: 'No experience needed', body: 'Most of the crew started knowing nothing about a lighting desk. You learn it on the job, with people who will show you.' },
  { icon: Users, title: 'A proper team', body: 'You will be on a real production with real responsibility, not making the tea. Well, occasionally the tea.' },
  { icon: CalendarDays, title: 'Flexible around school', body: 'You pick the sessions you can make. Tell the crew you cannot come and someone covers you.' },
  { icon: Sparkles, title: 'Something to show for it', body: 'Lights, sound, stage and media skills, plus a wall of show memories at the end of it.' },
];

const STEPS = [
  { n: '01', title: 'Come to a session', body: 'Turn up to a rehearsal or a club meeting and see what the crew actually does. No commitment.' },
  { n: '02', title: 'Get on the list', body: 'Ask an admin to add your school email. That is your whole account: no password, no sign-up form.' },
  { n: '03', title: 'Sign in and go', body: 'Sign in with your school address and your dates, roles and reminders are all there waiting.' },
];

/** How to get involved, with the two ways to reach the crew. */
export default function Join() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden px-4 pb-12 pt-14 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-40%] h-[420px] w-[800px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(236,55,80,0.35), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-6xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <UserPlus className="h-3.5 w-3.5" /> Join the crew
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            There is a place for you backstage.
          </h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            {SCHOOL} is open to anyone at the school, in any year. Whether you want to run a desk, work the wings or
            keep the mics alive, come and find us.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="h-12 rounded-full px-6 text-base">
              <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Join the WhatsApp community
              </a>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-full px-6 text-base">
              <Link to="/calendar">See what is on</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">What you get out of it.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {OFFER.map((o) => (
              <div key={o.title} className="flex gap-4 rounded-2xl border bg-card p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                  <o.icon className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <h3 className="font-semibold">{o.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Three steps to get on the crew.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="rounded-2xl border bg-card p-5">
                <span className="font-mono text-sm text-primary">{s.n}</span>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                {i === 2 && (
                  <Button asChild size="sm" className="mt-4 rounded-full">
                    <Link to="/signin">Sign in</Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 rounded-3xl border border-primary/25 bg-primary/[0.04] p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Talk to us.</h2>
              <p className="mt-3 max-w-prose leading-relaxed text-muted-foreground">
                The quickest way in is the crew WhatsApp community. If you are already on the crew list, you can sign
                in straight away. If you are not, ask any admin to add your school email.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-6">
                  <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp community
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                  <Link to="/signin"><Mail className="mr-2 h-4 w-4" /> Crew sign in</Link>
                </Button>
              </div>
            </div>
            <ul className="space-y-2.5 text-sm">
              {['Open to every year group', 'No experience required', 'Pick the sessions you can make', 'Your data stays with the admins'].map((f) => (
                <li key={f} className="flex items-start gap-2.5 rounded-xl border bg-card/60 px-3.5 py-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
