import { useState } from 'react';
import { motion } from 'framer-motion';
import { MASCOT } from '../lib/mascot';
import { useAppSettings } from '../lib/appSettings';
import { useCatHidden } from '../lib/uiPrefs';
import { playSfx } from '../lib/sfx';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { Cat, MessageCircle, Sparkles } from 'lucide-react';

/**
 * The crew mascot's page (Batch 8): who Tabby is, and why there is a cat in the
 * lighting box. Also where you turn the floating cat on or off and ask it to say
 * something.
 */
export default function Mascot() {
  const [hidden, setHidden] = useCatHidden();
  const { catName } = useAppSettings();
  const [line, setLine] = useState(MASCOT.line());

  return (
    <div className="mx-auto max-w-3xl space-y-8 hc-stagger">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border bg-card p-8 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: 'radial-gradient(600px 240px at 50% -10%, rgba(236,55,80,0.18), transparent 70%)' }} />
        <div className="relative">
          <motion.img
            src={MASCOT.image}
            alt={catName}
            draggable={false}
            className="mx-auto h-32 w-32 drop-shadow-xl"
            animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
            transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
          />
          <h1 className="mt-4 text-4xl font-bold tracking-tight">{catName}</h1>
          <p className="mt-1 text-sm font-medium uppercase tracking-wider text-primary">{MASCOT.role}</p>
          <p className="mt-3 text-lg text-muted-foreground">{MASCOT.tagline}</p>
        </div>
      </div>

      {/* Backstory */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Cat className="h-5 w-5 text-primary" />Backstory</h2>
        <div className="space-y-3 rounded-2xl border bg-card p-5 text-sm leading-relaxed">
          {MASCOT.backstory.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>

      {/* The cat says */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><MessageCircle className="h-5 w-5 text-primary" />The cat says</h2>
        <div className="rounded-2xl border bg-card p-6 text-center">
          <p className="min-h-[2.5rem] text-lg italic">{line}</p>
          <Button className="mt-4" onClick={() => { setLine(MASCOT.line()); playSfx('pop'); }}>
            <Sparkles className="mr-1.5 h-4 w-4" />Ask the cat
          </Button>
        </div>
      </section>

      {/* Character sheet */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Character sheet</h2>
        <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {MASCOT.facts.map((f) => (
            <div key={f.label} className="bg-card p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Companion toggle */}
      <section className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-5">
        <div>
          <h3 className="font-semibold">Roaming the app</h3>
          <p className="text-sm text-muted-foreground">Show {catName} in the corner of every page. It is per device, so a shared computer need not have a cat.</p>
        </div>
        <Switch checked={!hidden} onCheckedChange={(on) => { setHidden(!on); playSfx('pop'); }} aria-label="Show the cat on every page" />
      </section>
    </div>
  );
}
