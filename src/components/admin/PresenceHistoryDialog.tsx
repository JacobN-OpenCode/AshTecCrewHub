import { useEffect, useState } from 'react';
import { adminGetSessionDetail } from '#api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { Clock, DoorClosed, DoorOpen, LogIn, LogOut, XCircle } from 'lucide-react';

type Event = {
  id: string; memberId: string; memberName: string; action: string;
  reasonLabel: string; reason: string; comingBack: boolean; expectedBackAt: string | null;
  at: string | null; byName: string;
};
type Roster = {
  memberId: string; name: string; year: string; roles: string[]; state: string | null;
  signedInAt: string | null; signedOutAt: string | null;
};
type Detail = {
  session: {
    id: string; title: string; type: string; date: string | null; status: string;
    startedAt: string | null; endedAt: string | null; startedByName: string; endedByName: string;
  };
  events: Event[];
  roster: Roster[];
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

/** Icon + colour per timeline action. */
function actionStyle(action: string) {
  if (action === 'Sign In') return { Icon: LogIn, tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
  if (action === 'Sign Out') return { Icon: LogOut, tone: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
  if (action === 'Session Opened') return { Icon: DoorOpen, tone: 'text-primary border-primary/30 bg-primary/10' };
  if (action === 'Session Closed') return { Icon: DoorClosed, tone: 'text-muted-foreground border-border bg-muted' };
  return { Icon: XCircle, tone: 'text-red-400 border-red-500/30 bg-red-500/10' };
}

/**
 * Ticket 168e8274. Shows a venue check-in session's timeline.
 *
 * With `memberId` set it narrows to one person (the live page, tapping someone
 * in the room); without it, it is the whole-session backlog: every event plus
 * the final roster with each member's first sign-in and last sign-out.
 */
export default function PresenceHistoryDialog({ sessionId, memberId, onClose }: {
  sessionId: string | null;
  memberId?: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setDetail(null);
    setFailed(false);
    adminGetSessionDetail({ sessionId })
      .then((d) => setDetail(d as Detail))
      .catch(() => setFailed(true));
  }, [sessionId]);

  const events = detail ? (memberId ? detail.events.filter((e) => e.memberId === memberId) : detail.events) : [];
  const person = memberId ? detail?.roster.find((r) => r.memberId === memberId) : null;

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? person.name : detail?.session.title ?? 'Check-in session'}</DialogTitle>
          <DialogDescription>
            {detail
              ? person
                ? 'Every sign-in and sign-out for this session, and who approved it.'
                : `${when(detail.session.startedAt)}${detail.session.endedAt ? ` to ${clock(detail.session.endedAt)}` : ' · still open'}`
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        {failed && <p className="text-sm text-destructive">Could not load that session.</p>}
        {!detail && !failed && <Skeleton className="h-40 rounded-xl" />}

        {detail && (
          <div className="space-y-5">
            {!person && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Opened by {detail.session.startedByName || 'unknown'}</Badge>
                {detail.session.endedAt
                  ? <Badge variant="outline">Closed by {detail.session.endedByName || 'unknown'}</Badge>
                  : <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Open</Badge>}
                <Badge variant="outline">{detail.roster.length} on the roster</Badge>
              </div>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{person ? 'Timeline' : 'Full timeline'}</h3>
              {events.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">
                  Nothing was logged in this session yet.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {events.map((e) => {
                    const { Icon, tone } = actionStyle(e.action);
                    return (
                      <li key={e.id} className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5">
                        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', tone)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{e.action}</span>
                            {!person && e.memberName && <span className="text-muted-foreground"> · {e.memberName}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {clock(e.at)}
                            {e.byName && <> · approved by {e.byName}</>}
                            {e.reasonLabel && <> · {e.reasonLabel}</>}
                            {e.comingBack && e.expectedBackAt && <> · back at {clock(e.expectedBackAt)}</>}
                          </p>
                          {e.reason && <p className="text-xs italic text-muted-foreground">“{e.reason}”</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {!person && detail.roster.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Final roster</h3>
                <ul className="divide-y rounded-xl border">
                  {detail.roster.map((r) => (
                    <li key={r.memberId} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                      {r.state && <Badge variant="outline">{r.state}</Badge>}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {r.signedInAt ? `in ${clock(r.signedInAt)}` : 'never in'}
                        {r.signedOutAt ? ` · out ${clock(r.signedOutAt)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
