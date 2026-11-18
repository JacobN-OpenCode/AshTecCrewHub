import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  adminCheckInScan, adminGetPresence, adminGetRegister, adminRegisterAttendance,
  presenceDecision, presenceEnd, presenceStart,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import QrScanner from '../../components/admin/QrScanner';
import {
  ArrowLeft, Camera, Check, ChevronRight, Clock, DoorOpen, Loader2, Search, Users, X,
} from 'lucide-react';
import { cn } from '@project/components/lib/utils';

/**
 * One check-in page (feedback round 3).
 *
 * The old screen asked the admin to open a presence session, then choose
 * between a QR tab and a register tab, then approve each scan on a third page.
 * This is the same work in the order it actually happens: pick the session in
 * front of you, then tap names or scan codes. A club session has nothing to
 * scan for, so it never offers the camera.
 *
 * Every tap writes attendance immediately, so a half-taken register is never
 * lost if the page is closed or the phone locks.
 */

type Mode = 'scan' | 'register';

type EventOption = {
  id: string; title: string; type: string; subtype: string;
  date: string | null; startTime: string | null; endTime: string | null;
  showNames: string[]; mode: Mode;
};

type Row = {
  id: string; name: string; year: string; roles: string[];
  ticked: boolean; rsvp: string; expected: boolean;
};

type PresenceRow = {
  id: string; memberId: string; name: string; year: string; roles: string[];
  state: string | null; pendingAction: string | null; token: string | null;
  reasonLabel: string; reason: string; comingBack: boolean;
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const when = (date: string | null) => {
  if (!date) return 'No date';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const timeRange = (start: string | null, end: string | null) => {
  if (!start) return '';
  return end ? `${start}–${end}` : start;
};

const kindLabel = (e: EventOption) => e.subtype || e.type || 'Event';

export default function AdminCheckIn() {
  const [params, setParams] = useSearchParams();
  const [pick, setPick] = useState<{ events: EventOption[]; openSession: { title: string; subEventId: string } | null } | null>(null);
  const [chosen, setChosen] = useState('');
  const [roster, setRoster] = useState<{ event: EventOption; members: Row[]; ticked: number; sessionFor: { thisEvent: boolean; open: boolean } } | null>(null);
  const [presence, setPresence] = useState<{ session: { id: string; title: string } | null; roster: PresenceRow[] } | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  const wantScan = useRef(params.get('scan') === '1');

  const loadPick = useCallback(async () => {
    try {
      const r = await adminGetRegister({});
      setPick({ events: r.events as EventOption[], openSession: r.openSession });
      setProblem('');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoster = useCallback(async (subEventId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [r, p] = await Promise.all([
        adminGetRegister({ subEventId }),
        adminGetPresence({}).catch(() => null),
      ]);
      setRoster(r as never);
      if (p) setPresence(p as never);
      setProblem('');
      return r as { event: EventOption };
    } catch (e) {
      setProblem((e as Error).message);
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPick(); }, [loadPick]);

  // Opening a session in the URL (?session=…) keeps a refresh on the same
  // register, which matters on a phone that reloads when you switch apps.
  useEffect(() => {
    if (pick && !chosen) {
      const fromUrl = params.get('session');
      if (fromUrl && pick.events.some((e) => e.id === fromUrl)) setChosen(fromUrl);
    }
  }, [pick, chosen, params]);

  useEffect(() => {
    if (!chosen) { setRoster(null); return; }
    void loadRoster(chosen).then((r) => {
      if (r && wantScan.current && r.event.mode === 'scan') {
        wantScan.current = false;
        setScannerOpen(true);
      }
    });
  }, [chosen, loadRoster]);

  // The door list changes while you are looking at it: people scan in on their
  // own phones, so the waiting list has to keep up without a manual refresh.
  useEffect(() => {
    if (!chosen || roster?.event.mode !== 'scan') return;
    const t = setInterval(() => { void loadRoster(chosen, true); }, 15000);
    return () => clearInterval(t);
  }, [chosen, roster?.event.mode, loadRoster]);

  const pickEvent = (id: string) => {
    setChosen(id);
    setQ('');
    const next = new URLSearchParams(params);
    next.set('session', id);
    next.delete('scan');
    setParams(next, { replace: true });
  };

  const back = () => {
    setChosen('');
    setRoster(null);
    setQ('');
    const next = new URLSearchParams(params);
    next.delete('session');
    setParams(next, { replace: true });
    void loadPick();
  };

  const tick = async (m: Row) => {
    if (busy) return;
    setBusy(m.id);
    // Optimistic: a door queue should not wait on a round trip to show a tick.
    setRoster((r) => (r ? { ...r, members: r.members.map((x) => (x.id === m.id ? { ...x, ticked: !x.ticked } : x)) } : r));
    try {
      await adminRegisterAttendance({ subEventId: chosen, memberId: m.id, present: !m.ticked });
      await loadRoster(chosen, true);
    } catch (e) {
      toast.error((e as Error).message);
      await loadRoster(chosen, true);
    } finally {
      setBusy('');
    }
  };

  const startDoor = async () => {
    setBusy('door');
    try {
      await presenceStart({ subEventId: chosen });
      toast.success('Door check-in open. Codes can be scanned now.');
      await loadRoster(chosen, true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(''); }
  };

  const endDoor = async () => {
    setBusy('door');
    try {
      const r = await presenceEnd({});
      toast.success(`Door check-in closed${r.voided ? `. ${r.voided} waiting code${r.voided === 1 ? '' : 's'} voided` : ''}.`);
      await loadRoster(chosen, true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(''); }
  };

  const approve = async (row: PresenceRow) => {
    if (!row.token) return;
    setBusy(row.memberId);
    try {
      await presenceDecision({ token: row.token, decision: 'approve' });
      toast.success(`${row.name} ${row.pendingAction === 'Sign Out' ? 'signed out' : 'is in'}.`);
      await loadRoster(chosen, true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(''); }
  };

  const onToken = async (token: string) => {
    setScannerOpen(false);
    try {
      const r = await adminCheckInScan({ subEventId: chosen, token });
      toast.success(`${r.memberName} checked in.`);
      await loadRoster(chosen, true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    const rows = roster?.members ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((m) =>
      m.name.toLowerCase().includes(needle) ||
      m.year.toLowerCase().includes(needle) ||
      m.roles.join(' ').toLowerCase().includes(needle),
    );
  }, [roster, q]);

  const groups = useMemo(() => {
    const events = pick?.events ?? [];
    const today = todayLocal();
    const start = (e: EventOption) => `${e.date ?? '9999'}${e.startTime ?? ''}`;
    return [
      { label: 'Today', rows: events.filter((e) => e.date === today).sort((a, b) => start(a).localeCompare(start(b))) },
      { label: 'Coming up', rows: events.filter((e) => (e.date ?? '') > today).sort((a, b) => start(a).localeCompare(start(b))) },
      { label: 'Already happened', rows: events.filter((e) => (e.date ?? '') < today).sort((a, b) => start(b).localeCompare(start(a))).slice(0, 12) },
    ].filter((g) => g.rows.length);
  }, [pick]);

  if (loading && !roster) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading check-in…</div>;
  }

  if (problem && !pick && !roster) {
    return <div className="p-6 text-sm text-red-400">{problem}</div>;
  }

  // ---------------------------------------------------------------- picker
  if (!chosen || !roster) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Pick the session you are standing at. Club sessions are a register; shows also take a code.
          </p>
        </header>

        {pick?.openSession && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
            <DoorOpen className="h-4 w-4 text-emerald-400" />
            <span className="font-medium">Door check-in open:</span>
            <span className="text-muted-foreground">{pick.openSession.title}</span>
          </div>
        )}

        {!groups.length && (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">No dated events yet. Add one under Events first.</p>
        )}

        {groups.map((g) => (
          <section key={g.label} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {g.rows.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => pickEvent(e.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/40 active:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.title || 'Untitled event'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {when(e.date)} · {timeRange(e.startTime, e.endTime) || 'No time'} · {kindLabel(e)}
                        {e.showNames.length ? ` · ${e.showNames.join(', ')}` : ''}
                      </p>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      e.mode === 'scan' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}>
                      {e.mode === 'scan' ? 'Show' : 'Register'}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------- roster
  const event = roster.event;
  const waiting = (presence?.roster ?? []).filter((r) => r.pendingAction);
  const inRoom = (presence?.roster ?? []).filter((r) => !r.pendingAction && r.state === 'On Site');
  const doorOpenHere = roster.sessionFor.thisEvent;

  return (
    <div className="space-y-4 pb-24">
      <header className="space-y-2">
        <button onClick={back} className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />All sessions
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{event.title || 'Untitled event'}</h1>
          <p className="text-xs text-muted-foreground">
            {when(event.date)} · {timeRange(event.startTime, event.endTime) || 'No time'} · {kindLabel(event)}
            {event.showNames.length ? ` · ${event.showNames.join(', ')}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            {roster.ticked} of {roster.members.length} ticked
          </span>
          {event.mode === 'register' && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Register only</span>
          )}
          {doorOpenHere && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">Door open</span>
          )}
        </div>
      </header>

      {/* Door controls. A show needs an open check-in before a code means
          anything, so it is one tap here rather than a separate screen. */}
      {event.mode === 'scan' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className="h-12 w-full text-base"
            onClick={() => {
              if (doorOpenHere) setScannerOpen(true);
              else void startDoor().then(() => setScannerOpen(true));
            }}
          >
            <Camera className="mr-2 h-5 w-5" />Scan a code
          </Button>
          {doorOpenHere ? (
            <Button variant="outline" className="h-12 w-full" onClick={endDoor} disabled={busy === 'door'}>
              {busy === 'door' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
              Close door check-in
            </Button>
          ) : (
            <Button variant="outline" className="h-12 w-full" onClick={startDoor} disabled={busy === 'door'}>
              {busy === 'door' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
              Open door check-in
            </Button>
          )}
        </div>
      )}

      {waiting.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <Clock className="h-4 w-4" />Waiting on you ({waiting.length})
          </h2>
          <ul className="mt-2 space-y-2">
            {waiting.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">wants to {r.pendingAction}{r.reasonLabel ? ` · ${r.reasonLabel}` : ''}</p>
                </div>
                <Button size="sm" className="h-9" onClick={() => approve(r)} disabled={busy === r.memberId}>
                  {busy === r.memberId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span className="ml-1.5">Approve</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a name, year or role"
            className="h-12 pl-9 text-base"
            inputMode="search"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border">
        {filtered.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => tick(m)}
              disabled={busy === m.id}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-muted',
                m.ticked ? 'bg-emerald-500/5' : 'hover:bg-muted/40',
              )}
            >
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                m.ticked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/30 text-transparent',
              )}>
                <Check className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[m.year && `Year ${m.year}`, m.roles.join(', ')].filter(Boolean).join(' · ') || 'Crew member'}
                  {m.rsvp && !m.ticked ? ` · answered ${m.rsvp}` : ''}
                </p>
              </div>
              {busy === m.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </button>
          </li>
        ))}
        {!filtered.length && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody matches “{q}”.</li>
        )}
      </ul>

      {inRoom.length > 0 && (
        <section className="rounded-xl border p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-emerald-400" />In the room ({inRoom.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">{inRoom.map((r) => r.name).join(', ')}</p>
        </section>
      )}

      <QrScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onToken={(t) => void onToken(t)} />
    </div>
  );
}
