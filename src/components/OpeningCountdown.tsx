import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pv } from '../lib/preview';
import { getCountdown, type GetCountdownOutputType } from '#api';
import { Sparkles } from 'lucide-react';

/**
 * Opening-night countdown for the home screen. Shows the days until the next
 * performance the member is involved in, with a nudge for how many rehearsals
 * are still to come. Renders nothing when nothing is on the horizon.
 */
export default function OpeningCountdown() {
  const [data, setData] = useState<GetCountdownOutputType | null>(null);
  useEffect(() => { getCountdown(pv()).then(setData).catch(() => setData(null)); }, []);

  const c = data?.countdown;
  if (!c) return null;

  const when = c.days === 0 ? 'Tonight' : c.days === 1 ? 'Tomorrow' : `${c.days} days`;

  return (
    <Link to={`/show/${c.showId}`} className="hc-rise block rounded-2xl border bg-card p-5 hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
        <Sparkles className="h-3.5 w-3.5" />Opening night
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tracking-tight">{when}</span>
        <span className="text-lg">{c.showName}{c.code ? <span className="text-muted-foreground font-mono text-sm"> · {c.code}</span> : ''}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {c.title}{c.date ? ` · ${c.date}` : ''}{c.startTime ? ` · ${c.startTime}` : ''}
        {c.rehearsalsRemaining > 0 && <> · {c.rehearsalsRemaining} rehearsal{c.rehearsalsRemaining === 1 ? '' : 's'} to go</>}
      </p>
    </Link>
  );
}
