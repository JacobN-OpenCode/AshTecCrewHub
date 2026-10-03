import { Badge } from '@project/components/ui/badge';
import { cn } from '@project/components/lib/utils';
import { Clock, MapPin, Backpack, CalendarDays } from 'lucide-react';
import type { GetMyEventsOutputType } from 'zitejs/api';
import { fmtDate, dueLabel, isPastDue, IMPORTANCE_STYLE } from '../lib/constants';

export type MySubEvent = GetMyEventsOutputType['subEvents'][number];
type Status = 'Expected Arrival' | 'Maybe' | 'Not Attending';

const OPTIONS: { v: Status; label: string; on: string }[] = [
  { v: 'Expected Arrival', label: 'Attending', on: 'bg-emerald-500 text-white border-emerald-500' },
  { v: 'Maybe', label: 'Maybe', on: 'bg-yellow-500 text-black border-yellow-500' },
  { v: 'Not Attending', label: 'Can’t go', on: 'bg-red-500 text-white border-red-500' },
];

export default function SubEventRow({ ev, onPick, disabled }: { ev: MySubEvent; onPick: (s: Status) => void; disabled?: boolean }) {
  const locked = disabled || isPastDue(ev.dueDate, ev.dueUnknown);
  return (
    <div className={cn('rounded-xl border p-4 bg-background/40', !ev.status && !locked && 'border-primary/40')}>
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{ev.title}</h4>
            {ev.subtype && <Badge variant="outline">{ev.subtype}</Badge>}
            <Badge variant="outline" className={IMPORTANCE_STYLE[ev.importance]}>{ev.importance}</Badge>
            {!ev.status && !locked && <Badge className="bg-primary/20 text-primary border-primary/30" variant="outline">Needs response</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(ev.date, ev.dateTbc)}</span>
            {ev.meetTime && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Meet {ev.meetTime}</span>}
            {ev.timings && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{ev.timings}</span>}
          </div>
          {ev.description && <p className="text-sm">{ev.description}</p>}
          {ev.thingsToBring && (
            <p className="text-sm flex gap-1"><Backpack className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />Bring: {ev.thingsToBring}</p>
          )}
          <p className="text-xs text-muted-foreground font-mono">{dueLabel(ev.dueDate, ev.dueUnknown)}</p>
          {ev.status === 'Not Attending' && ev.reason && <p className="text-xs text-red-400">Reason: {ev.reason}</p>}
        </div>
        <div className="flex gap-1.5 shrink-0">
          {OPTIONS.map((o) => (
            <button
              key={o.v}
              disabled={locked}
              onClick={() => onPick(o.v)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
                ev.status === o.v ? o.on : 'hover:bg-muted',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
