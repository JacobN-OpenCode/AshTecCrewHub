import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { presenceRequest } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import QrCode from '../components/QrCode';
import { CUSTOM_REASON, SIGN_OUT_REASONS, fmtDate } from '../lib/constants';
import { pv } from '../lib/preview';
import { useLivePresence } from '../lib/livePresence';
import { Clock, DoorOpen, Loader2, LogOut, MapPin, TriangleAlert } from 'lucide-react';
import { cn } from '@project/components/lib/utils';

const STATE_STYLE: Record<string, string> = {
  'On Site': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Off Site': 'bg-muted text-muted-foreground border-border',
  'Expected Back': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not at Venue': 'bg-red-500/15 text-red-400 border-red-500/30',
};

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

/** The admin scans this off the member's phone, so it points at this app's own origin. */
const approvalUrl = (token: string) => `${window.location.origin}/a/${token}`;

/** "back at 19:30" from the time the member said they would return. */
const backLabel = (iso: string | null) =>
  iso ? `back at ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default function Attendance() {
  // Reads the same live presence the header dot and banner use, so this page
  // adds no polling of its own.
  const { session, me: mine, loading, refresh } = useLivePresence();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reasonLabel, setReasonLabel] = useState('');
  const [reason, setReason] = useState('');
  const [comingBack, setComingBack] = useState(false);
  const [backTime, setBackTime] = useState('');

  // Poll fast while a code is waiting to be scanned, because the member is
  // standing there holding their phone up, and slow once it has settled.
  const pending = mine?.pendingAction ?? null;
  useEffect(() => {
    const t = setInterval(refresh, pending ? 4000 : 15000);
    return () => clearInterval(t);
  }, [refresh, pending]);

  const token = mine?.approvalToken ?? null;
  const url = useMemo(() => (token ? approvalUrl(token) : ''), [token]);

  const resetForm = () => {
    setAsking(false);
    setReasonLabel('');
    setReason('');
    setComingBack(false);
    setBackTime('');
  };

  const signIn = async () => {
    setBusy(true);
    try {
      await presenceRequest({ ...pv(), action: 'Sign In' });
      toast.success('Show the code to an admin');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (!reasonLabel) return toast.error('Pick a reason for leaving.');
    // Mirrors the server's own rule so the member finds out before the round trip.
    if (reasonLabel === CUSTOM_REASON && words(reason) < 8)
      return toast.error('Describe why you are leaving in at least 8 words.');
    if (comingBack && !backTime) return toast.error('Say what time you will be back.');

    setBusy(true);
    try {
      let expectedBackAt: string | undefined;
      if (comingBack && backTime) {
        const [h, m] = backTime.split(':').map(Number);
        const at = new Date();
        at.setHours(h || 0, m || 0, 0, 0);
        expectedBackAt = at.toISOString();
      }
      await presenceRequest({
        ...pv(),
        action: 'Sign Out',
        reasonLabel,
        reason: reasonLabel === CUSTOM_REASON ? reason : undefined,
        comingBack: comingBack || undefined,
        expectedBackAt,
      });
      resetForm();
      toast.success('Show the code to an admin');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Check-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in when you arrive so the stage manager knows who is in the room.
        </p>
      </div>

      {!session ? (
        <div className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">No check-in is open</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is being checked in right now. This page will work on its own once an admin opens a session for
            an event.
          </p>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            If a session should be open and this is wrong, tell a stage manager.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Check-in open
              </span>
              <p className="font-semibold">{session.title}</p>
              <span className="text-sm text-muted-foreground">
                {fmtDate(session.date)} · since {clock(session.startedAt)}
              </span>
            </div>
          </div>

          {pending ? (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/[0.05] p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-yellow-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for an admin to {pending.toLowerCase()} you
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hold this up to an admin&rsquo;s phone camera. The page updates on its own once they approve it.
              </p>
              {url && (
                <div className="mx-auto mt-5 w-full max-w-[19rem] rounded-2xl bg-white p-4">
                  <QrCode value={url} className="h-auto w-full" level="M" />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">Your status</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {mine?.state ? (
                      <Badge
                        variant="outline"
                        className={cn('border', STATE_STYLE[mine.state] ?? STATE_STYLE['Off Site'])}
                      >
                        {mine.state}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-dashed text-muted-foreground">
                        Not signed in
                      </Badge>
                    )}
                    {mine?.state === 'On Site' && mine.signedInAt && (
                      <span className="text-sm text-muted-foreground">since {clock(mine.signedInAt)}</span>
                    )}
                    {mine?.comingBack && mine.expectedBackAt && (
                      <span className="flex items-center gap-1 text-sm text-yellow-400">
                        <Clock className="h-3.5 w-3.5" />
                        {backLabel(mine.expectedBackAt)}
                      </span>
                    )}
                    {mine?.state && mine.state !== 'On Site' && mine.reasonLabel && (
                      <span className="text-sm text-muted-foreground">
                        {mine.reasonLabel}
                        {mine.reason && <span className="italic"> · &ldquo;{mine.reason}&rdquo;</span>}
                      </span>
                    )}
                  </div>
                </div>

                {mine?.state === 'On Site' ? (
                  <Button variant="outline" onClick={() => setAsking(true)} disabled={busy}>
                    <LogOut className="mr-2 h-4 w-4" />Sign out
                  </Button>
                ) : (
                  <Button onClick={signIn} disabled={busy}>
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <DoorOpen className="mr-2 h-4 w-4" />
                    )}
                    Sign in
                  </Button>
                )}
              </div>

              {asking && (
                <div className="space-y-4 rounded-2xl border p-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Where are you going?</label>
                    <Select
                      value={reasonLabel}
                      onValueChange={(v) => {
                        setReasonLabel(v);
                        if (v !== CUSTOM_REASON) setComingBack(false);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGN_OUT_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {reasonLabel === CUSTOM_REASON && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="custom-reason">
                        What are you doing?
                      </label>
                      <textarea
                        id="custom-reason"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="At least 8 words, so the stage manager knows where you are."
                        className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <p className="text-xs text-muted-foreground">
                        {words(reason)} word{words(reason) === 1 ? '' : 's'} · 8 needed
                      </p>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={comingBack}
                      onChange={(e) => setComingBack(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    I&rsquo;ll be back before the show
                  </label>

                  {comingBack && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="back-time">
                        What time?
                      </label>
                      <input
                        id="back-time"
                        type="time"
                        value={backTime}
                        onChange={(e) => setBackTime(e.target.value)}
                        className="rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={signOut} disabled={busy}>
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Show my code
                    </Button>
                    <Button variant="ghost" onClick={resetForm} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Every change needs an admin to approve it, so the roster only ever shows people who are actually here.
          </p>
        </>
      )}
    </div>
  );
}