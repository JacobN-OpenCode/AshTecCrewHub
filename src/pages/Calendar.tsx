import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getCalendar } from '#api';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Skeleton } from '@project/components/ui/skeleton';
import { ChevronLeft, ChevronRight, EyeOff, Clock, MapPin, ListChecks, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@project/components/ui/dialog';
import { cn } from '@project/components/lib/utils';
import { pv } from '../lib/preview';
import { useMe } from '../lib/me';
import MultiFilter from '../components/admin/MultiFilter';
import SubEventDialog from '../components/admin/SubEventDialog';
import { type AdminShow, type AdminSubEvent } from '../lib/useAdminData';
import { buildIcs, downloadIcs } from '../lib/ics';

type CalShow = AdminShow;

type CalResponse = { showId: string; response: string | null };
type CalEvent = {
  id: string; title: string; type: string; subtype?: string; showIds: string[];
  date: string | null; dateTbc: boolean; meetTime?: string; importance: string; hidden: boolean;
  description?: string; timings?: string; thingsToBring?: string;
  dueDate?: string | null; dueUnknown?: boolean; responses?: CalResponse[];
};

/** Local YYYY-MM-DD. toISOString would shift the day across the UTC boundary. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Six weeks from the Monday on or before the 1st, so the grid never reflows. */
const buildWeeks = (month: Date) => {
  const first = firstOfMonth(month);
  // getDay() is 0 for Sunday; shift so Monday is 0.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      return day;
    }),
  );
};

export default function Calendar() {
  const { me } = useMe();
  const [shows, setShows] = useState<CalShow[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d: any = await getCalendar(pv());
    setShows(d.shows as CalShow[]);
    setEvents(d.subEvents as CalEvent[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [pickedShows, setPickedShows] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [responses, setResponses] = useState<string[]>([]);
  const [editEvent, setEditEvent] = useState<AdminSubEvent | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  // Hidden events are only ever returned to admins, so only they can use this.
  const canSeeHidden = me.isAdmin;
  const [includeHidden, setIncludeHidden] = useState(true);

  const weeks = useMemo(() => buildWeeks(month), [month]);
  const today = iso(new Date());
  // What the detail sheet is showing: a whole day from the grid, or a single
  // undated event that has no day to sit on.
  const [sheet, setSheet] = useState<{ day: string } | { event: CalEvent } | null>(null);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (!includeHidden && e.hidden) return false;
        if (types.length && !types.includes(e.type)) return false;
        if (responses.length && !responses.some((r) => (e.responses ?? []).some((x) => x.response === r))) return false;
        // An event can belong to several shows; any match keeps it.
        if (pickedShows.length && !e.showIds.some((id) => pickedShows.includes(id))) return false;
        return true;
      }),
    [events, pickedShows, types, responses, includeHidden],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of filtered) {
      if (!e.date || e.dateTbc) continue;
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.meetTime || '99').localeCompare(b.meetTime || '99'));
    }
    return map;
  }, [filtered]);

  // Anything without a real date cannot sit in a grid, so it gets its own list.
  const undated = useMemo(
    () => filtered.filter((e) => !e.date || e.dateTbc).sort((a, b) => a.title.localeCompare(b.title)),
    [filtered],
  );

  const monthCount = useMemo(() => {
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    return filtered.filter((e) => e.date && !e.dateTbc && e.date.startsWith(prefix)).length;
  }, [filtered, month]);

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;

  const showName = (e: CalEvent) =>
    e.showIds.map((id) => shows.find((s) => s.id === id)?.name).filter(Boolean).join(', ');

  /** "Tuesday 14th October" from the same key the grid uses. */
  const prettyDay = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const dayKey = sheet && 'day' in sheet ? sheet.day : null;
  const dayEvents = dayKey ? byDate.get(dayKey) ?? [] : [];
  const soloEvent = sheet && 'event' in sheet ? sheet.event : null;

  const downloadCalendar = async () => {
    setCalBusy(true);
    try {
      const showName = (id: string) => shows.find((s) => s.id === id)?.name ?? '';
      const ics = buildIcs(filtered, showName, 'AshTec Crew');
      downloadIcs('ashtec-calendar.ics', ics);
      toast.success('Calendar file downloaded');
    } catch {
      toast.error('Could not build the calendar file', { description: 'Try again in a moment.' });
    } finally {
      setCalBusy(false);
    }
  };

  /** One event in the day sheet, with everything the admin wrote on it. */
  const DayRow = ({ e }: { e: CalEvent }) => (
    <div
      className={cn(
        'rounded-xl border p-3.5 space-y-2',
        e.type === 'Performance' ? 'border-pink-500/30 bg-pink-500/5' : 'border-sky-500/30 bg-sky-500/5',
        e.hidden && 'border-dashed opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{e.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {e.subtype || e.type}
            {e.importance && ` · ${e.importance} importance`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {e.hidden && <span className="flex items-center gap-1 text-[11px] text-amber-400"><EyeOff className="h-3.5 w-3.5" /> Hidden</span>}
          {me.isAdmin && <Button size="sm" variant="ghost" onClick={() => setEditEvent(e as unknown as AdminSubEvent)}>Edit</Button>}
        </div>
      </div>
      {showName(e) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> {showName(e)}
        </p>
      )}
      {e.meetTime && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" /> Meet {e.meetTime}
          {e.timings && ` · ${e.timings}`}
        </p>
      )}
      {e.description && <p className="text-sm leading-relaxed whitespace-pre-line">{e.description}</p>}
      {e.thingsToBring && (
        <p className="text-xs flex items-start gap-1.5">
          <ListChecks className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
          <span><span className="text-muted-foreground">Bring: </span>{e.thingsToBring}</span>
        </p>
      )}
      {e.dueUnknown ? (
        <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Response deadline not set
        </p>
      ) : e.dueDate ? (
        <p className="text-xs text-muted-foreground">
          Responses due by {new Date(e.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
        </p>
      ) : null}
    </div>
  );

  const Chip = ({ e }: { e: CalEvent }) => (
    <div
      title={[e.title, e.subtype || e.type, e.meetTime, showName(e)].filter(Boolean).join(' · ')}
      className={cn(
        'text-[11px] leading-tight rounded-md px-1.5 py-1 border truncate',
        e.type === 'Performance'
          ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
          : 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        e.hidden && 'opacity-60 border-dashed',
      )}
    >
      <div className="flex items-center gap-1">
        {e.meetTime && <span className="font-mono opacity-80 shrink-0">{e.meetTime}</span>}
        <span className="truncate">{e.title}</span>
        {e.hidden && <EyeOff className="h-3 w-3 shrink-0 opacity-70" />}
      </div>
      <div className="truncate opacity-70">{showName(e) || 'No show'}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {monthCount} event{monthCount === 1 ? '' : 's'} in {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            {undated.length > 0 && ` · ${undated.length} with no date yet`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setMonth(firstOfMonth(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-semibold">
            {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div data-tour="calendar-filters" className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={downloadCalendar} disabled={calBusy}>{calBusy ? 'Building…' : 'Download .ics'}</Button>
        <MultiFilter label="Show" options={shows.map((s) => ({ value: s.id, label: s.name }))} selected={pickedShows} onChange={setPickedShows} />
        <MultiFilter
          label="My response"
          options={[{ value: 'Yes', label: 'Yes' }, { value: 'Maybe', label: 'Maybe' }, { value: 'No', label: 'No' }]}
          selected={responses}
          onChange={setResponses}
        />
        <MultiFilter
          label="Type"
          options={[{ value: 'Rehearsal', label: 'Rehearsal' }, { value: 'Performance', label: 'Performance' }]}
          selected={types}
          onChange={setTypes}
        />
        {canSeeHidden && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground ml-1">
            <Checkbox checked={includeHidden} onCheckedChange={(c) => setIncludeHidden(!!c)} />
            Include hidden
          </label>
        )}
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground">{d}</div>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const key = iso(day);
              const list = byDate.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = key === today;
              return (
                <div key={key} className={cn('min-h-24 border-r last:border-r-0', !inMonth && 'bg-muted/20')}>
                  <button
                    type="button"
                    onClick={() => setSheet({ day: key })}
                    aria-label={`${prettyDay(key)}, ${list.length} event${list.length === 1 ? '' : 's'}`}
                    className={cn(
                      'group w-full h-full text-left p-1.5 space-y-1 transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                      list.length === 0 && 'cursor-default hover:bg-transparent',
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={cn(
                          'text-xs tabular-nums w-6 h-6 inline-flex items-center justify-center rounded-full',
                          isToday ? 'bg-primary text-primary-foreground font-semibold' : inMonth ? '' : 'text-muted-foreground/50',
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {list.length > 0 && (
                        <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
                          details
                        </span>
                      )}
                    </span>
                    {list.slice(0, 3).map((e) => <Chip key={e.id} e={e} />)}
                    {list.length > 3 && (
                      <p className="text-[11px] text-muted-foreground pl-1 font-medium">+{list.length - 3} more</p>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Dialog open={Boolean(sheet)} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">
              {dayKey ? prettyDay(dayKey) : soloEvent ? soloEvent.title : 'Event details'}
            </DialogTitle>
            <DialogDescription>
              {dayEvents.length > 0
                ? `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'} on this day.`
                : soloEvent
                  ? [soloEvent.subtype || soloEvent.type, showName(soloEvent) || 'No show']
                      .filter(Boolean)
                      .join(' · ')
                  : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {dayEvents.map((e) => (
              <DayRow key={e.id} e={e} />
            ))}
            {soloEvent && <DayRow e={soloEvent} />}
          </div>
        </DialogContent>
      </Dialog>

      {me.isAdmin && (
        <SubEventDialog
          open={!!editEvent}
          ev={editEvent}
          shows={shows}
          defaultShowId={editEvent?.showIds[0]}
          onClose={() => setEditEvent(null)}
          onSaved={async () => { setEditEvent(null); await load(); }}
        />
      )}

      {undated.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <div>
            <h2 className="font-semibold">No date yet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">These have no confirmed date, so they can&apos;t be placed on the grid.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {undated.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSheet({ event: e })}
                className="text-left rounded-lg border p-3 space-y-1 w-full transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{e.title}</span>
                  {e.hidden && <EyeOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {e.subtype || e.type} · {showName(e) || 'No show'}
                  {e.meetTime && ` · meet ${e.meetTime}`}
                </p>
                {e.description && <p className="text-xs text-muted-foreground line-clamp-2">{e.description}</p>}
                <p className="text-[11px] text-primary">Click for details</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
