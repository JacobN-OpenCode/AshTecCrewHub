import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { pv } from '../lib/preview';
import {
  getSchedule, saveAvailability, saveRotaSlot, claimRotaSlot, saveSchedulePrefs, getFamilyFeed,
  saveBlackout, type GetScheduleOutputType,
} from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { AlertTriangle, CalendarRange, CalendarOff, ClipboardCheck, Copy, Clock, Settings2, Plus, Trash2 } from 'lucide-react';

type Sched = GetScheduleOutputType;
type Tab = 'clashes' | 'term' | 'availability' | 'rotas' | 'prefs';

const TABS: { id: Tab; label: string; icon: typeof AlertTriangle }[] = [
  { id: 'clashes', label: 'Clashes', icon: AlertTriangle },
  { id: 'term', label: 'Term', icon: CalendarRange },
  { id: 'availability', label: 'My availability', icon: CalendarOff },
  { id: 'rotas', label: 'Rotas', icon: ClipboardCheck },
  { id: 'prefs', label: 'Preferences', icon: Settings2 },
];

export default function Schedule() {
  const { me } = useMe();
  const [data, setData] = useState<Sched | null>(null);
  const [tab, setTab] = useState<Tab>('clashes');

  const load = useCallback(async () => {
    try { setData(await getSchedule(pv())); } catch (e) { toast.error((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="space-y-4"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); await load(); if (msg) toast.success(msg); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6 hc-stagger">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground mt-1">Clash checking, what the term looks like, when you are not free, and how you get nudged.</p>
      </div>

      <SetOff events={data.events} travelMinutes={data.travelMinutes ?? 0} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-3.5 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5', tab === t.id ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
            <t.icon className="h-4 w-4" />{t.label}
            {t.id === 'clashes' && data.clashes.length > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{data.clashes.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'clashes' && <Clashes data={data} />}
      {tab === 'term' && <Term data={data} act={act} isAdmin={me.isAdmin} />}
      {tab === 'availability' && <Availability data={data} act={act} />}
      {tab === 'rotas' && <Rotas data={data} act={act} isAdmin={me.isAdmin} />}
      {tab === 'prefs' && <Prefs data={data} act={act} />}
    </div>
  );
}

type ActFn = (fn: () => Promise<unknown>, msg?: string) => Promise<void>;

/** "Leave by" for the next timed event, from the member's own travel allowance. */
function SetOff({ events, travelMinutes }: { events: Sched['events']; travelMinutes: number }) {
  const mins = (t?: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const today = new Date().toISOString().slice(0, 10);
  const next = events
    .filter((e) => e.date && e.date >= today && (e.startTime || e.meetTime))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || String(a.startTime ?? a.meetTime ?? '').localeCompare(String(b.startTime ?? b.meetTime ?? '')))[0];
  if (!next) return null;
  const call = mins(next.startTime) ?? mins(next.meetTime);
  if (call === null) return null;
  const leave = call - travelMinutes;
  const fmt = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const leaveStr = leave <= 0 ? fmt(((leave % 1440) + 1440) % 1440) + ' (previous day)' : fmt(leave);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <Clock className="h-4 w-4 text-primary shrink-0" />
      <span>
        Next up: <span className="font-medium">{next.title}</span>{next.date ? ` on ${next.date}` : ''} at{' '}
        <span className="font-medium">{next.startTime ?? `meet ${next.meetTime}`}</span>
        {travelMinutes > 0 && <> · leave by <span className="font-semibold text-primary">{leaveStr}</span> ({travelMinutes} min travel)</>}
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border bg-card p-5 space-y-4">{children}</div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }

function Clashes({ data }: { data: Sched }) {
  if (!data.clashes.length) return <Card><p className="text-sm text-emerald-500 font-medium">No clashes. Nothing you are down for overlaps with anything else, and nothing lands on a day you said you were busy.</p></Card>;
  return (
    <div className="space-y-3">
      {data.clashes.map((c, i) => (
        <Card key={i}>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(c.kind === 'unavailable' ? 'border-amber-500 text-amber-500' : 'border-red-500 text-red-500')}>{c.kind === 'unavailable' ? 'Unavailable' : 'Overlap'}</Badge>
            <span className="font-medium">{c.date}</span>
          </div>
          <p className="text-sm text-muted-foreground">{c.reason}</p>
          <ul className="space-y-1">
            {c.events.map((e) => (
              <li key={e.id} className="text-sm flex flex-wrap gap-x-2">
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground">{e.type}{e.startTime ? ` · ${e.startTime}${e.endTime ? `-${e.endTime}` : ''}` : e.meetTime ? ` · meet ${e.meetTime}` : ''}{e.showName ? ` · ${e.showName}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Term({ data, act, isAdmin }: { data: Sched; act: ActFn; isAdmin: boolean }) {
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <h3 className="font-semibold text-sm">Exam blackout dates</h3>
          <div className="flex flex-wrap gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. GCSEs)" className="max-w-xs" />
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            <Button disabled={!startDate} onClick={() => act(async () => { await saveBlackout({ label, startDate, endDate }); setLabel(''); setStartDate(''); setEndDate(''); }, 'Blackout added')}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>
          {data.blackouts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.blackouts.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs">
                  {b.label || 'Blackout'} · {b.startDate}{b.endDate && b.endDate !== b.startDate ? ` – ${b.endDate}` : ''}
                  <button onClick={() => act(() => saveBlackout({ id: b.id, remove: true }), 'Removed')} className="hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
      {data.terms.length === 0 && <Card><Empty>No upcoming events to lay out by term.</Empty></Card>}
      {data.terms.map((t) => (
        <Card key={t.term}>
          <h3 className="font-semibold">{t.term} <span className="text-muted-foreground font-normal text-sm">· {t.events.length} event{t.events.length === 1 ? '' : 's'}</span></h3>
          <ul className="divide-y">
            {t.events.map((e) => {
              const blocked = data.blackouts.some((b) => b.startDate && e.date && e.date >= b.startDate && e.date <= (b.endDate || b.startDate));
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                  <span><span className="font-mono text-muted-foreground mr-2">{e.date ?? 'TBC'}</span>{e.title}{e.showName && <span className="text-muted-foreground"> · {e.showName}</span>}</span>
                  {blocked && <Badge variant="outline" className="border-amber-500 text-amber-500">Exam period</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Availability({ data, act }: { data: Sched; act: ActFn }) {
  const [date, setDate] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Card>
      <p className="text-sm text-muted-foreground">Tell the hub once when you are not free, and it will flag anything scheduled that clashes.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-primary" />Whole day</label>
        {!allDay && <>
          <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="w-28" />
          <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="w-28" />
        </>}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="max-w-xs" />
        <Button disabled={!date || (!allDay && (!fromTime || !toTime))} onClick={() => act(async () => { await saveAvailability({ date, allDay, fromTime, toTime, reason }); setDate(''); setReason(''); setFromTime(''); setToTime(''); }, 'Saved')}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>
      {!data.availability.length && <Empty>Nothing marked. Add a day (or a few hours) you cannot make.</Empty>}
      <div className="space-y-2">
        {data.availability.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span><span className="font-mono">{a.date}</span> · {a.allDay ? 'All day' : `${a.fromTime}–${a.toTime}`}{a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}</span>
            <button onClick={() => act(() => saveAvailability({ id: a.id, remove: true }), 'Removed')} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Rotas({ data, act, isAdmin }: { data: Sched; act: ActFn; isAdmin: boolean }) {
  const [subEventId, setSubEventId] = useState('');
  const [role, setRole] = useState('');
  const [capacity, setCapacity] = useState('1');
  return (
    <Card>
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <select value={subEventId} onChange={(e) => setSubEventId(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="">Pick an event for a new slot</option>
            {data.events.map((e) => <option key={e.id} value={e.id}>{e.title}{e.date ? ` · ${e.date}` : ''}</option>)}
          </select>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (FOH, Stewarding…)" className="max-w-xs" />
          <Input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-20" />
          <Button disabled={!subEventId || !role.trim()} onClick={() => act(async () => { await saveRotaSlot({ subEventId, role, capacity: Number(capacity) || 1 }); setRole(''); setCapacity('1'); }, 'Slot opened')}><Plus className="h-4 w-4 mr-1" />Open slot</Button>
        </div>
      )}
      {!data.rotas.length && <Empty>No rota slots are open right now.</Empty>}
      <div className="space-y-2">
        {data.rotas.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{r.role}</span>
              <span className="text-muted-foreground"> · {r.eventTitle}{r.date ? ` · ${r.date}` : ''}{r.startTime ? ` ${r.startTime}` : ''}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{r.taken}/{r.capacity}</span>
              {r.signedUp
                ? <Button size="sm" variant="outline" onClick={() => act(() => claimRotaSlot({ slotId: r.id, release: true }), 'Stepped down')}>Release</Button>
                : <Button size="sm" disabled={r.taken >= r.capacity} onClick={() => act(() => claimRotaSlot({ slotId: r.id }), 'You are on the rota')}>{r.taken >= r.capacity ? 'Full' : 'Sign up'}</Button>}
              {isAdmin && <button onClick={() => act(() => saveRotaSlot({ id: r.id, remove: true }), 'Slot removed')} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Prefs({ data, act }: { data: Sched; act: ActFn }) {
  const [travel, setTravel] = useState(String(data.travelMinutes ?? 0));
  const [feed, setFeed] = useState<{ parentsUrl: string; parentsWebcal: string; memberUrl: string } | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(data.reminderPrefs || '{}'); } catch { return {}; }
  });
  const types = ['Rehearsal', 'Performance', 'Club Session'];

  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => toast.success('Copied')).catch(() => toast.error('Could not copy')); };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-semibold text-sm">Travel time</h3>
        <p className="text-sm text-muted-foreground">How long to leave for getting to a call. The hub subtracts it from the meet time so you see when to set off.</p>
        <div className="flex items-end gap-2">
          <Input value={travel} onChange={(e) => setTravel(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-24" />
          <span className="text-sm text-muted-foreground pb-2">minutes</span>
          <Button onClick={() => act(() => saveSchedulePrefs({ travelMinutes: Number(travel) || 0 }), 'Saved')}>Save</Button>
        </div>
      </Card>
      <Card>
        <h3 className="font-semibold text-sm">Reminders per event type</h3>
        <p className="text-sm text-muted-foreground">Tick the types you want a reminder for.</p>
        {types.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prefs[t] !== false} onChange={(e) => setPrefs({ ...prefs, [t]: e.target.checked })} className="h-4 w-4 accent-primary" />
            {t}
          </label>
        ))}
        <Button onClick={() => act(() => saveSchedulePrefs({ reminderPrefs: JSON.stringify(prefs) }), 'Saved')}>Save reminders</Button>
      </Card>
      <Card>
        <h3 className="font-semibold text-sm">Share with parents</h3>
        <p className="text-sm text-muted-foreground">A calendar link a parent can add once. It stays up to date on its own.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={async () => { const f = feed ?? await getFamilyFeed(); setFeed(f as never); copy((f as { parentsWebcal: string }).parentsWebcal); }}><Copy className="h-4 w-4 mr-1" />Copy parents calendar link</Button>
          <Button variant="outline" size="sm" onClick={async () => { const f = feed ?? await getFamilyFeed(); setFeed(f as never); copy((f as { memberUrl: string }).memberUrl); }}><Copy className="h-4 w-4 mr-1" />Copy my calendar link</Button>
        </div>
      </Card>
    </div>
  );
}
