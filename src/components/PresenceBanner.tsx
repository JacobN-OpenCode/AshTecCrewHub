import { Link } from 'react-router-dom';
import { useLivePresence } from '../lib/livePresence';
import { Clock, DoorOpen } from 'lucide-react';
import { cn } from '@project/components/lib/utils';

const STATE_STYLE: Record<string, string> = {
  'On Site': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Off Site': 'bg-muted text-muted-foreground border-border',
  'Expected Back': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  'Not at Venue': 'bg-red-500/15 text-red-400 border-red-500/30',
};

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Sits under the header on every signed-in page so nobody has to go looking for
 * check-in. It hides itself on /attendance, where the page is already about to
 * say all of this at full size.
 */
export default function PresenceBanner({ hide }: { hide?: boolean }) {
  const { session, me } = useLivePresence();
  if (!session || hide) return null;

  const pending = me?.pendingAction;

  return (
    <Link
      to="/attendance"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-3 transition-colors hover:bg-primary/[0.08]"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Check-in open
      </span>

      <span className="min-w-0 flex-1 truncate font-semibold">{session.title}</span>

      {pending ? (
        <span className="text-sm text-yellow-400">waiting for an admin to {pending.toLowerCase()} you</span>
      ) : me?.state ? (
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className={cn('rounded-full border px-2 py-0.5 text-xs', STATE_STYLE[me.state] ?? STATE_STYLE['Off Site'])}>
            {me.state}
          </span>
          {me.state === 'On Site' && me.signedInAt && (
            <span className="text-muted-foreground">since {clock(me.signedInAt)}</span>
          )}
          {me.comingBack && me.expectedBackAt && (
            <span className="flex items-center gap-1 text-yellow-400">
              <Clock className="h-3.5 w-3.5" />
              back at {clock(me.expectedBackAt)}
            </span>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-sm text-primary">
          <DoorOpen className="h-4 w-4" />Sign in
        </span>
      )}
    </Link>
  );
}