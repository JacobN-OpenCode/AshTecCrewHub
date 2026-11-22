import { useCallback, useEffect, useState } from 'react';
import { adminGetAudioDeck, deckControlRequest, deckControlCommand } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Download, Pause, Play, Radio, RefreshCw, SkipForward, X } from 'lucide-react';

type Deck = Awaited<ReturnType<typeof adminGetAudioDeck>>;

const APP_RELEASES = 'https://github.com/JacobN-OpenCode/ashtec-audio-deck/releases';

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-full shrink-0 text-xs uppercase tracking-wider text-muted-foreground sm:w-56">{k}</span>
      <span className="min-w-0 break-words text-sm">{v}</span>
    </div>
  );
}

function clock(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
}

/**
 * The show laptop's Audio Deck app reports in every few seconds. Admins can ask
 * for temporary control; the operator approves it on the deck itself, which
 * opens a 2-minute window for these buttons. Nothing moves without that nod.
 */
export default function AdminAudioDeck() {
  const [d, setD] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      setD(await adminGetAudioDeck({}));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 4000);
    return () => clearInterval(i);
  }, [load]);

  // A 1s tick only while a window is open, so the countdown actually counts.
  useEffect(() => {
    if (!d?.control.approved) return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [d?.control.approved]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestControl = () => act(() => deckControlRequest({ action: 'request' }));
  const cancelControl = () => act(() => deckControlRequest({ action: 'cancel' }));
  const command = (action: 'play' | 'pause' | 'skip') => act(() => deckControlCommand({ action }));

  if (!d) return <Skeleton className="h-96 rounded-2xl" />;

  const status = (d.state.status ?? {}) as { playing?: boolean; trackName?: string | null; queueCount?: number; autoPlay?: boolean; appVersion?: string };
  const control = d.control;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audio Deck</h1>
          <p className="text-sm text-muted-foreground">
            The show laptop's deck app: now playing, audio updates, and temporary remote control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={d.online ? 'border-emerald-500/40 text-emerald-400' : 'border-red-500/40 text-red-400'}>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${d.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {d.online ? 'deck online' : 'deck offline'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(APP_RELEASES, '_blank')}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Get the app
          </Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Now">
          <Row k="Track" v={status.trackName || <span className="text-muted-foreground">nothing loaded</span>} />
          <Row
            k="State"
            v={
              status.playing ? (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">playing</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">paused</Badge>
              )
            }
          />
          <Row k="Queue" v={`${status.queueCount ?? 0} track${(status.queueCount ?? 0) === 1 ? '' : 's'} · auto-play ${status.autoPlay ? 'on' : 'off'}`} />
          <Row k="App version" v={status.appVersion || 'unknown'} />
          <Row k="Last check-in" v={d.state.updatedAt ? ago(d.state.updatedAt) : 'never'} />
        </Card>

        <Card
          title="Temporary control"
          right={<Radio className="h-4 w-4 text-muted-foreground" />}
        >
          {control.approved ? (
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  Control active for <b className="font-mono">{clock(control.approved.until)}</b>
                </span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">granted by the operator</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => command('play')} disabled={busy}>
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Play
                </Button>
                <Button size="sm" variant="outline" onClick={() => command('pause')} disabled={busy}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                </Button>
                <Button size="sm" variant="outline" onClick={() => command('skip')} disabled={busy}>
                  <SkipForward className="mr-1.5 h-3.5 w-3.5" /> Skip
                </Button>
              </div>
            </div>
          ) : control.pending ? (
            <div className="space-y-3 p-4">
              <span className="text-sm">
                Sent to the deck <b>{ago(control.pending.createdAt)}</b> - waiting for the operator to approve it (expires after 60s).
              </span>
              <div>
                <Button size="sm" variant="outline" onClick={cancelControl} disabled={busy}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Cancel request
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <span className="text-sm text-muted-foreground">
                Ask the operator on the show laptop for a turn at the controls. They approve it in the deck app, and you
                get play/pause/skip for 2 minutes.
              </span>
              <div>
                <Button size="sm" onClick={requestControl} disabled={busy || !d.online}>
                  Request control
                </Button>
                {!d.online && <span className="ml-2 text-xs text-muted-foreground">the deck is offline</span>}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Audio updates" right={<span className="text-xs text-muted-foreground">latest 40</span>}>
        {d.events.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Nothing yet - events appear here as soon as the deck app starts a track, skips, or loads a config.
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {d.events.map((e, i) => (
              <li key={`${e.seq}-${i}`} className="flex gap-3 px-4 py-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{ago(e.createdAt)}</span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
