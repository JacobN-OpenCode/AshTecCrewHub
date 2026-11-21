import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '#auth';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { presenceApproval, presenceDecision } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { CheckCircle2, Loader2, LogIn, LogOut, TriangleAlert, XCircle } from 'lucide-react';
import { SignInPanel } from '../components/LoginScreen';

type Preview = {
  status: 'ready' | 'closed' | 'invalid' | 'not_admin';
  selfApproval?: boolean;
  pendingAction?: string;
  member?: { id: string; name: string; year: string; roles: string[] };
  reasonLabel?: string;
  reason?: string;
  comingBack?: boolean;
  expectedBackAt?: string | null;
  currentState?: string | null;
  session?: { id: string; title: string };
};

const ACTION_COPY: Record<string, { verb: string; blurb: string }> = {
  'Sign In': { verb: 'sign in', blurb: 'put them in the room' },
  'Sign Out': { verb: 'sign out', blurb: 'take them off the count' },
};

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">{children}</div>;
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="w-full" onClick={onClick}>
      Cancel and go back
    </Button>
  );
}

/**
 * Phone-first destination for a venue QR. It deliberately works before sign-in:
 * the scanner may be a signed-out admin, and the QR must not dump them at the
 * marketing page. Once signed in, the server decides whether they can approve.
 */
export default function ApprovePresence() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [waitingForAnotherAdmin, setWaitingForAnotherAdmin] = useState(false);

  const goBack = () => nav(user ? '/attendance' : '/');

  const load = useCallback(async () => {
    if (!user || !token) return;
    setError('');
    try {
      setData((await presenceApproval({ token })) as Preview);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, user]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decision: 'approve' | 'decline') => {
    setBusy(true);
    setError('');
    try {
      const r = await presenceDecision({ token, decision });
      setResult(
        decision === 'approve'
          ? {
              ok: true,
              text: `${r.memberName} is now ${
                r.state === 'On Site' ? 'in the room' : r.state === 'Off Site' ? 'off site' : 'expected back'
              }.`,
            }
          : { ok: false, text: `Declined. ${r.memberName} has not been changed.` },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading)
    return <Shell><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></Shell>;

  if (!user)
    return (
      <Shell>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Venue check-in</Badge>
            <h1 className="text-2xl font-bold tracking-tight">Admin approval</h1>
            <p className="text-sm text-muted-foreground">
              Sign in first. If this is your own admin account, you can choose to approve your own sign-in without another admin.
            </p>
          </div>
          <SignInPanel callbackURL={location.pathname} />
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (result)
    return (
      <Shell>
        <div className="space-y-5 text-center">
          {result.ok
            ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            : <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />}
          <h1 className="text-xl font-bold">{result.ok ? 'Done' : 'Not approved'}</h1>
          <p className="text-sm text-muted-foreground">{result.text}</p>
          <Button className="w-full" onClick={() => nav('/admin/attendance')}>Back to check-in</Button>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (error)
    return (
      <Shell>
        <div className="space-y-5 text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">Can’t approve this</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="w-full" onClick={load}>Try again</Button>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (!data)
    return <Shell><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></Shell>;

  if (data.status === 'not_admin')
    return (
      <Shell>
        <div className="space-y-5 text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">Another admin needs to scan this</h1>
          <p className="text-sm text-muted-foreground">
            Your account is not a crew admin, so you cannot approve this QR code. The member can keep the code open while an admin scans it.
          </p>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (data.status === 'closed')
    return (
      <Shell>
        <div className="space-y-5 text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">This check-in session has ended</h1>
          <p className="text-sm text-muted-foreground">Ask the member to start a new check-in request.</p>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (data.status === 'invalid')
    return (
      <Shell>
        <div className="space-y-5 text-center">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">This QR code is no longer valid</h1>
          <p className="text-sm text-muted-foreground">Ask the member to generate a new code.</p>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  const copy = ACTION_COPY[data.pendingAction ?? ''] ?? { verb: data.pendingAction ?? 'change status', blurb: 'change their status' };
  const signingIn = data.pendingAction === 'Sign In';

  if (waitingForAnotherAdmin)
    return (
      <Shell>
        <div className="space-y-5 text-center">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">Waiting for another admin</Badge>
          <h1 className="text-xl font-bold">Leave the QR open</h1>
          <p className="text-sm text-muted-foreground">
            Another admin can scan the same code and approve this request. Nothing has been changed yet.
          </p>
          <Button variant="outline" className="w-full" onClick={load}>Check again</Button>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  if (data.selfApproval)
    return (
      <Shell>
        <div className="space-y-6 text-center">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">You are an admin</Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            Do you want to {copy.verb} without another admin?
          </h1>
          <p className="text-sm text-muted-foreground">
            This QR belongs to your own account. You can approve it yourself, or leave it waiting for another admin to scan.
          </p>
          <div className="space-y-2">
            <Button className="h-14 w-full text-base" disabled={busy} onClick={() => decide('approve')}>
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
              Yes, {signingIn ? 'sign me in' : 'sign me out'}
            </Button>
            <Button variant="outline" className="h-14 w-full text-base" disabled={busy} onClick={() => setWaitingForAnotherAdmin(true)}>
              No, wait for another admin
            </Button>
          </div>
          <CancelButton onClick={goBack} />
        </div>
      </Shell>
    );

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            {data.session?.title ?? 'Venue session'}
          </Badge>
          <h1 className="text-balance text-2xl font-bold tracking-tight">
            {data.member?.name ?? 'This crew member'} wants to {copy.verb}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[data.member?.year, ...(data.member?.roles ?? [])].filter(Boolean).join(' · ')}
          </p>
        </div>

        <dl className="space-y-2 rounded-2xl border p-4 text-sm">
          {data.currentState && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Right now</dt>
              <dd className="font-medium">{data.currentState}</dd>
            </div>
          )}
          {data.reasonLabel && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="font-medium">{data.reasonLabel}</dd>
            </div>
          )}
          {data.reason && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Detail</dt>
              <dd className="text-right italic">“{data.reason}”</dd>
            </div>
          )}
          {data.comingBack && data.expectedBackAt && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Back at</dt>
              <dd className="font-medium text-yellow-400">{time(data.expectedBackAt)}</dd>
            </div>
          )}
        </dl>

        {!signingIn && data.comingBack && data.expectedBackAt && (
          <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
            Approving counts them as away until {time(data.expectedBackAt)}, not off site entirely.
          </p>
        )}

        <div className="space-y-2">
          <Button className="h-14 w-full text-base" disabled={busy} onClick={() => decide('approve')}>
            {busy
              ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              : signingIn
                ? <LogIn className="mr-2 h-5 w-5" />
                : <LogOut className="mr-2 h-5 w-5" />}
            Approve — {copy.blurb}
          </Button>
          <Button variant="outline" className="h-14 w-full text-base" disabled={busy} onClick={() => decide('decline')}>
            <XCircle className="mr-2 h-5 w-5" />Decline
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Declining leaves them exactly as they are now.
        </p>
        <CancelButton onClick={goBack} />
      </div>
    </Shell>
  );
}
