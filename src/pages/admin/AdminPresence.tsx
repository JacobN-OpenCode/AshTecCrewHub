import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminGetPresence, adminGetPresenceHistory, presenceEnd, presenceStart } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { ChevronRight, DoorOpen, History, Loader2, LogOut, MapPin, TriangleAlert, UserCheck } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { fmtDate } from '../../lib/constants';
import PresenceHistoryDialog from '../../components/admin/PresenceHistoryDialog';

type Row = {
  id: string
  memberId: string
  name: string
  year: string
  roles: string[]
  state: string | null
  reasonLabel: string
  reason: string
  comingBack: boolean
  expectedBackAt: string | null
  signedInAt: string | null
  signedOutAt: string | null
  pendingAction: string | null
};

type SessionSummary = {
  id: string; title: string; type: string; date: string | null; status: string;
  startedAt: string | null; endedAt: string | null; startedByName: string; endedByName: string;
  checkedIn: number; eventCount: number;
};

type Payload = {
  session: { id: string; title: string; type: string; date: string | null; startedAt: string | null } | null
  roster: Row[]
  canManage: boolean
  subEvents: { id: string; title: string; date: string | null }[]
};

const STATE_STYLE: Record<string, string> = {
  'On Site': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Off Site': 'bg-muted text-muted-foreground border-border',
  'Expected Back': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not at Venue': 'bg-red-500/15 text-red-400 border-red-500/30',
};

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

/** "back at 19:30", from the time the member said they would return. */
function backLabel(iso: string | null) {
  return iso ? `back at ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';
}

function RosterGroup({
  title, hint, rows, empty, onSelect,
}: {
  title: string
  hint?: string
  rows: Row[]
  empty: string
  onSelect?: (r: Row) => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{rows.length}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-2xl border">
          {rows.map((r) => (
            <li key={r.id}>
              <div
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(r) : undefined}
                onKeyDown={onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r); } } : undefined}
                className={cn(
                  'flex flex-wrap items-center gap-2 px-3.5 py-3',
                  onSelect && 'cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.year, ...r.roles].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {r.reasonLabel && <span className="text-muted-foreground">{r.reasonLabel}</span>}
                  {r.reason && <span className="max-w-[22ch] truncate italic text-muted-foreground">“{r.reason}”</span>}
                  {r.comingBack && backLabel(r.expectedBackAt) && (
                    <span className="text-yellow-400">{backLabel(r.expectedBackAt)}</span>
                  )}
                  {r.pendingAction && (
                    <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
                      wants to {r.pendingAction.toLowerCase()}
                    </Badge>
                  )}
                  {r.state && (
                    <Badge variant="outline" className={cn('border', STATE_STYLE[r.state] ?? STATE_STYLE['Off Site'])}>
                      {r.state}
                    </Badge>
                  )}
                  {onSelect && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminPresence() {
  const [live, setLive] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [detail, setDetail] = useState<{ sessionId: string; memberId?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLive(await adminGetPresence({}));
    } catch {
      // A failed poll should not blank the roster that is already on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await adminGetPresenceHistory({});
      setHistory(r.sessions as SessionSummary[]);
    } catch {
      // History is secondary; a failure must not break the live roster.
    }
  }, []);

  useEffect(() => {
    load();
    loadHistory();
    // Polls because a stage manager is watching this on a laptop across the
    // room while crew scan in; without it the numbers only move on reload.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load, loadHistory]);

  // Only dated, non-hidden events can host check-in: a TBC date has nothing to
  // check in against. The endpoint already filters both out, so the picker can
  // never offer a choice the start call would reject.
  const canManage = live?.canManage ?? false;
  const options = live?.subEvents ?? [];
  useEffect(() => {
    if (options.length && !options.some((e) => e.id === eventId)) setEventId(options[0].id);
  }, [options, eventId]);

  const start = async () => {
    if (!eventId) return;
    setBusy(true);
    try {
      await presenceStart({ subEventId: eventId });
      toast.success('Check-in is open');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    setBusy(true);
    try {
      const r = await presenceEnd({});
      toast.success(r.voided ? `Check-in closed. ${r.voided} pending code(s) voided.` : 'Check-in closed');
      await load();
      await loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmEnd(false);
    }
  };

  if (loading || !live) return <Skeleton className="h-96 rounded-2xl" />;

  const roster = live?.roster ?? [];
  const waiting = roster.filter((r) => r.pendingAction);
  const onSite = roster.filter((r) => !r.pendingAction && r.state === 'On Site');
  const away = roster.filter((r) => !r.pendingAction && r.state !== 'On Site');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Venue Check-in</h1>
        {live.session && canManage && (
          <Button variant="outline" onClick={() => setConfirmEnd(true)} disabled={busy}>
            <LogOut className="h-4 w-4 mr-1" />End check-in
          </Button>
        )}
        {live.session && !canManage && (
          <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
            Read-only
          </span>
        )}
      </div>

      {!live.session ? (
        <div className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">No check-in is open</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? 'Open one when the crew arrives. Only one can run at a time, so the roster always has a single room in it.'
              : 'An admin opens one when the crew arrives. This page fills in on its own.'}
          </p>
          {canManage && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-2">
              <label className="text-sm font-medium">Event</label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue placeholder="Pick an event" /></SelectTrigger>
                <SelectContent>
                  {options.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} — {fmtDate(e.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={start} disabled={busy || !eventId}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
              Open check-in
            </Button>
          </div>
          )}
          {canManage && options.length === 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <TriangleAlert className="h-4 w-4" />No dated events yet. Add one under Events first.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Check-in open
              </span>
              <p className="font-semibold">{live.session.title}</p>
              <span className="text-sm text-muted-foreground">
                {fmtDate(live.session.date)} · since {clock(live.session.startedAt)}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="font-mono text-foreground">{onSite.length}</span> in the room
              {waiting.length > 0 && <>, <span className="font-mono text-yellow-400">{waiting.length}</span> waiting on you</>}
            </p>
          </div>

          <div className="space-y-5">
            <RosterGroup
              title="Waiting for you to approve"
              rows={waiting}
              onSelect={(r) => live.session && setDetail({ sessionId: live.session.id, memberId: r.memberId })}
              empty={
                canManage
                  ? "Nobody is waiting. Scan a crew member’s code with your phone camera to approve it."
                  : 'Nobody is waiting on an admin right now.'
              }
            />
            <RosterGroup
              title="In the room"
              rows={onSite}
              onSelect={(r) => live.session && setDetail({ sessionId: live.session.id, memberId: r.memberId })}
              empty="Nobody has been scanned in yet."
            />
            <RosterGroup
              title="Stepped out"
              rows={away}
              onSelect={(r) => live.session && setDetail({ sessionId: live.session.id, memberId: r.memberId })}
              empty="Nobody has left."
            />
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {canManage
              ? "Crew approve their own sign-in and sign-out by showing you the code on their phone. Opening their code takes you to a page with Approve and Decline."
              : 'Admins approve every change, so this roster only lists people who are actually in the room.'}
          </p>
        </>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="h-4 w-4" />Session backlog
            <span className="font-mono text-xs text-muted-foreground">{history.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Open any session to see who signed in and out, when, and which admin approved it.</p>
          <ul className="divide-y rounded-2xl border">
            {history.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setDetail({ sessionId: s.id })}
                  className="flex w-full flex-wrap items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {s.title}
                      {s.status === 'Active' && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />live
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(s.date)}
                      {s.startedAt && ` · ${new Date(s.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      {s.endedAt && ` – ${clock(s.endedAt)}`}
                      {s.startedByName && ` · opened by ${s.startedByName}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.checkedIn} checked in</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PresenceHistoryDialog
        sessionId={detail?.sessionId ?? null}
        memberId={detail?.memberId}
        onClose={() => setDetail(null)}
      />

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              The roster closes as it stands. Anyone still holding an approval code has it voided, and the crew
              cannot sign in or out until a new session is opened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it open</AlertDialogCancel>
            <AlertDialogAction onClick={end} disabled={busy}>End check-in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}