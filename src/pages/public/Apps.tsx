import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  Apple, Check, Download, Lock, ShieldCheck, Smartphone, Watch,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';

/** The invite code for the download page. A soft gate, not real security. */
const INVITE_CODE = 'JN202610';
const UNLOCK_KEY = 'ashtec-apps-unlocked';

/**
 * /apps — the download page for the crew hub's own apps (feedback round 2,
 * round 3). Gated behind an invite code. Everything here is sideload / drag
 * across: no App Store, no Play Store, no paid developer accounts.
 */
export default function Apps() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; }
  });
  const [choice, setChoice] = useState<'none' | 'wear' | 'mac'>('none');

  const unlock = () => {
    if (code.trim().toUpperCase() === INVITE_CODE) {
      setUnlocked(true);
      setError('');
      try { localStorage.setItem(UNLOCK_KEY, '1'); } catch { /* private mode */ }
    } else {
      setError('That code is not right.');
    }
  };

  return (
    <PublicLayout>
      <section className="px-4 pb-8 pt-14 sm:pt-20">
        <div className="mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Download className="h-3.5 w-3.5" /> Crew apps
          </span>
          <h1 className="mt-4 text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            AshTec, on your wrist and your Mac.
          </h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            Real apps for the crew hub, built by the crew. No App Store, no Play Store, no accounts
            to sign up for — you install them yourself.
          </p>
        </div>
      </section>

      {!unlocked ? (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-md rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight">Invite code</h2>
            </div>
            <p className="text-sm text-muted-foreground">These downloads are for the crew. Enter the code to continue.</p>
            <div className="mt-4 flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') unlock(); }}
                placeholder="Invite code"
                className="font-mono"
              />
              <Button onClick={unlock}>Unlock</Button>
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          </div>
        </section>
      ) : (
        <section className="px-4 pb-24">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setChoice(choice === 'wear' ? 'none' : 'wear')}
                className={`rounded-3xl border p-6 text-left transition-colors ${choice === 'wear' ? 'border-primary bg-primary/[0.06]' : 'bg-card hover:border-primary/40'}`}
              >
                <Watch className="h-7 w-7 text-primary" />
                <p className="mt-3 text-xl font-bold">Wear OS</p>
                <p className="text-sm text-muted-foreground">A watch face for your next call. Sideload with adb — no Play Store.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {choice === 'wear' ? 'Hide instructions' : 'Choose Wear OS'} <Check className={`h-4 w-4 ${choice === 'wear' ? '' : 'opacity-0'}`} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setChoice(choice === 'mac' ? 'none' : 'mac')}
                className={`rounded-3xl border p-6 text-left transition-colors ${choice === 'mac' ? 'border-primary bg-primary/[0.06]' : 'bg-card hover:border-primary/40'}`}
              >
                <Apple className="h-7 w-7 text-primary" />
                <p className="mt-3 text-xl font-bold">macOS</p>
                <p className="text-sm text-muted-foreground">The whole crew hub in a real Mac app, plus a live menu-bar countdown.</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {choice === 'mac' ? 'Hide instructions' : 'Choose macOS'} <Check className={`h-4 w-4 ${choice === 'mac' ? '' : 'opacity-0'}`} />
                </span>
              </button>
            </div>

            {choice === 'wear' && <WearInstructions />}
            {choice === 'mac' && <MacInstructions />}

            <div className="flex items-start gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Both apps read the crew hub with your own private link, so there is nothing to log in to on the device.
                Keep that link to yourself. The invite code is only a soft gate on this page.
              </p>
            </div>
          </div>
        </section>
      )}
    </PublicLayout>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
      <span className="text-sm leading-relaxed text-muted-foreground">{children}</span>
    </li>
  );
}

function WearInstructions() {
  return (
    <div className="rounded-3xl border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Smartphone className="h-5 w-5 text-primary" /> Wear OS</h2>
        <Button asChild className="rounded-full">
          <a href="/downloads/AshTec-wear.apk" download>
            <Download className="mr-2 h-4 w-4" /> Download AshTec-wear.apk
          </a>
        </Button>
      </div>
      <p className="mt-3 text-muted-foreground">
        A watch face for your next call: a live countdown and the next few calls, straight from the crew hub.
      </p>
      <ol className="mt-5 space-y-3">
        <Step n={1}>On the watch, turn on developer mode: <b>Settings → System → About → tap “Build number” 7 times</b>.</Step>
        <Step n={2}>In <b>Settings → Developer options</b>, enable <b>ADB debugging</b> and <b>Wireless debugging</b> (or USB debugging).</Step>
        <Step n={3}>On a computer with <code className="rounded bg-muted px-1.5 py-0.5">adb</code> (macOS: <code className="rounded bg-muted px-1.5 py-0.5">brew install android-platform-tools</code>), connect to the watch: <code className="rounded bg-muted px-1.5 py-0.5">adb connect &lt;watch-ip&gt;:5555</code>.</Step>
        <Step n={4}>Install it: <code className="rounded bg-muted px-1.5 py-0.5">adb install -r AshTec-wear.apk</code>.</Step>
        <Step n={5}>Open <b>AshTec</b> on the watch, tap <b>Set link</b>, and paste your next-call link (crew hub → Settings → copy your calendar feed, then swap <code className="rounded bg-muted px-1.5 py-0.5">/calendar.ics</code> for <code className="rounded bg-muted px-1.5 py-0.5">/next-call.json</code>).</Step>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        No Play Store, no Google account, no $25. It is a plain APK, so “Install unknown apps” prompts are expected.
      </p>
    </div>
  );
}

function MacInstructions() {
  return (
    <div className="rounded-3xl border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Apple className="h-5 w-5 text-primary" /> macOS</h2>
        <Button asChild className="rounded-full">
          <a href="/downloads/AshTec-macOS.zip" download>
            <Download className="mr-2 h-4 w-4" /> Download AshTec-macOS.zip
          </a>
        </Button>
      </div>
      <p className="mt-3 text-muted-foreground">
        The whole crew hub in a real Mac app, with a cat and a live countdown to your next call in the menu bar.
      </p>
      <ol className="mt-5 space-y-3">
        <Step n={1}>Download and unzip, then drag <b>AshTec.app</b> into your <b>Applications</b> folder.</Step>
        <Step n={2}>First open: <b>right-click the app → Open</b>, then confirm. (It is not notarised by Apple, so the first launch needs this once.)</Step>
        <Step n={3}>Click <b>Sign in…</b> in the AshTec menu and enter your school email. The link we send opens the app and finishes signing you in.</Step>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Requires macOS 13 or newer. Built by the crew, unsigned and un-notarised — hence the one-off right-click.
      </p>
    </div>
  );
}
