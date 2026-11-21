import { Link } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import {
  Aperture, Cable, Lightbulb, Mic, Projector, Radio, Sparkles, Users, Volume2, Wand2,
} from 'lucide-react';
import { ROLES, SCHOOL } from '../../lib/constants';
import PublicLayout from '../../components/public/PublicLayout';

const DEPARTMENTS = [
  { icon: Lightbulb, name: 'Lighting', body: 'Programming the desk, focusing the rig and calling the cues that shape every scene.' },
  { icon: Volume2, name: 'Sound', body: 'Mixing the band and the mics, running playbacks, and keeping the walk-in music on time.' },
  { icon: Mic, name: 'Microphone Management', body: 'Fitting radio mics, swapping packs at the interval and never losing a battery.' },
  { icon: Aperture, name: 'Follow Spot', body: 'Keeping the principals lit from the back of the hall, one cue at a time.' },
  { icon: Users, name: 'Stage Crew', body: 'Moving set and props in the wings and resetting the stage between scenes.' },
  { icon: Projector, name: 'Media & Projection', body: 'Projections, backdrops and anything that ends up on a screen.' },
];

const KIT = [
  { icon: Lightbulb, label: 'Lighting desk & rig' },
  { icon: Volume2, label: 'Sound desk & PA' },
  { icon: Mic, label: 'Radio microphones' },
  { icon: Aperture, label: 'Follow spots' },
  { icon: Radio, label: 'Backstage comms' },
  { icon: Projector, label: 'Projection & media' },
];

const TIMELINE = [
  { n: '01', title: 'Read-through', body: 'The crew hears the script, meets the show and starts the running order.' },
  { n: '02', title: 'Rehearsals', body: 'We learn the cues, the quick changes and who is needed when.' },
  { n: '03', title: 'Tech week', body: 'Lights, sound and mics get their levels and the cue sheet goes live.' },
  { n: '04', title: 'Show nights', body: 'The run itself, with the live show board keeping every department in step.' },
  { n: '05', title: 'Strike & debrief', body: 'We pack down, log what went wrong and write it up for next time.' },
];

/** Who the crew are and what a production actually takes. */
export default function About() {
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
            <Users className="h-3.5 w-3.5" /> About the crew
          </span>
          <h1 className="mt-4 max-w-3xl text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            The people behind the curtain.
          </h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            {SCHOOL} is a student-run technical crew. We rig the lights, run the sound, fit the mics and call the
            cues for every production the school puts on, from the first read-through to the last night. Nobody
            here is a professional. We learn it by doing it, together, and then we do it again next term.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="h-12 rounded-full px-6 text-base"><Link to="/join">Join the crew</Link></Button>
            <Button asChild variant="outline" className="h-12 rounded-full px-6 text-base"><Link to="/productions">See what we are working on</Link></Button>
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Departments</h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            A show runs on six desks. Most people start on one and drift into another.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((d) => (
              <div key={d.name} className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                  <d.icon className="h-5 w-5 text-primary" />
                </span>
                <h3 className="font-semibold">{d.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <span key={r} className="inline-flex items-center gap-2 rounded-xl border bg-background px-3.5 py-2 text-sm">
                <Wand2 className="h-3.5 w-3.5 text-primary" /> {r}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A show, from page to stage.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {TIMELINE.map((t) => (
              <div key={t.n} className="rounded-2xl border bg-card p-5">
                <span className="font-mono text-sm text-primary">{t.n}</span>
                <h3 className="mt-2 font-semibold">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kit */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border bg-card p-6 sm:p-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Cable className="h-3.5 w-3.5" /> The kit
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What we run the show on.</h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {KIT.map((k) => (
                <div key={k.label} className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3">
                  <k.icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-medium">{k.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border bg-card p-8 text-center sm:p-12">
            <Sparkles className="mx-auto h-7 w-7 text-primary" />
            <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">Come and try it.</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              You do not need any experience. Turn up to a session, see what the crew does, and decide from there.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="rounded-full px-8"><Link to="/join">How to join</Link></Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-8"><Link to="/calendar">See what is on</Link></Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
