import { previewId } from '../lib/preview';
import { useState } from 'react';
import { toast } from 'sonner';
import { setShowResponse, setAttendance, type GetMyEventsOutputType } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { cn } from '@project/components/lib/utils';
import SubEventRow, { type MySubEvent } from './SubEventRow';
import ReasonDialog from './ReasonDialog';
import { dueLabel, isPastDue } from '../lib/constants';

type Show = GetMyEventsOutputType['shows'][number];
type Item = { subEventId: string; status: 'Expected Arrival' | 'Maybe' | 'Not Attending'; reason?: string };
const NOT = ['Not Attending', 'Not Attending Event'];

export default function ShowCard({ show, events, reload }: { show: Show; events: MySubEvent[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Item[] | null>(null);
  const locked = isPastDue(show.dueDate, show.dueUnknown);
  const perfs = events.filter((e) => e.type === 'Performance');
  const rehearsals = events.filter((e) => e.type === 'Rehearsal');

  const respond = async (r: 'Yes' | 'No' | 'Maybe') => {
    setBusy(true);
    try { await setShowResponse({ showId: show.id, response: r, memberId: previewId() }); await reload(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const commit = async (items: Item[]) => {
    setBusy(true);
    try {
      const res = await setAttendance({ items, memberId: previewId() });
      if (res.rehearsalsCancelled) toast.warning(`${res.rehearsalsCancelled} rehearsal(s) marked as not attending.`);
      else toast.success('Saved');
      await reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setReasonFor(null); }
  };

  const save = (items: Item[]) => {
    const next = new Map(events.map((e) => [e.id, e.status]));
    items.forEach((i) => next.set(i.subEventId, i.status));
    const noPerfs = perfs.length > 0 && perfs.every((p) => NOT.includes(next.get(p.id) ?? ''));
    const affected = rehearsals.some((r) => !NOT.includes(next.get(r.id) ?? ''));
    if (noPerfs && affected) setPending(items);
    else commit(items);
  };

  const pick = (ids: string[], status: Item['status']) =>
    status === 'Not Attending' ? setReasonFor(ids) : save(ids.map((id) => ({ subEventId: id, status })));

  const Group = ({ title, list }: { title: string; list: MySubEvent[] }) =>
    list.length ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">{title} ({list.length})</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => pick(list.map((e) => e.id), 'Expected Arrival')}>Attending all</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => pick(list.map((e) => e.id), 'Not Attending')}>Not attending all</Button>
          </div>
        </div>
        {list.map((e) => <SubEventRow key={e.id} ev={e} disabled={busy} onPick={(s) => pick([e.id], s)} />)}
      </div>
    ) : null;

  return (
    <section className="rounded-2xl border bg-card p-5 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{show.name}</h2>
            {show.code && <Badge variant="outline" className="font-mono">{show.code}</Badge>}
            {!show.response && !locked && <Badge className="bg-primary text-primary-foreground">Respond</Badge>}
          </div>
          {show.description && <p className="text-sm text-muted-foreground mt-1">{show.description}</p>}
          <p className="text-xs text-muted-foreground font-mono mt-1">{dueLabel(show.dueDate, show.dueUnknown)}</p>
        </div>
        <div data-tour="show-respond" className="flex gap-1.5">
          {(['Yes', 'Maybe', 'No'] as const).map((r) => (
            <button key={r} disabled={busy || locked} onClick={() => respond(r)}
              className={cn('px-4 py-2 rounded-lg border font-medium text-sm transition-colors disabled:opacity-50',
                show.response === r ? (r === 'Yes' ? 'bg-emerald-500 text-white border-emerald-500' : r === 'No' ? 'bg-red-500 text-white border-red-500' : 'bg-yellow-500 text-black border-yellow-500') : 'hover:bg-muted')}>
              {r === 'Yes' ? 'I’m in' : r === 'No' ? 'Not taking part' : 'Maybe'}
            </button>
          ))}
        </div>
      </div>
      {show.response === 'No' && <p className="text-sm text-muted-foreground">You’re marked as not attending every rehearsal and performance for this show.</p>}
      {(show.response === 'Yes' || show.response === 'Maybe') && (
        events.length ? <div className="space-y-6"><Group title="Performances" list={perfs} /><Group title="Rehearsals" list={rehearsals} /></div>
          : <p className="text-sm text-muted-foreground">No rehearsals or performances have been added yet.</p>
      )}
      <ReasonDialog open={!!reasonFor} busy={busy} title={reasonFor && reasonFor.length > 1 ? 'Not attending all' : 'Can’t attend'}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => { const ids = reasonFor!; setReasonFor(null); save(ids.map((id) => ({ subEventId: id, status: 'Not Attending', reason }))); }} />
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No performances selected</AlertDialogTitle>
            <AlertDialogDescription>
              If you aren’t attending at least one performance of {show.name}, you automatically can’t come to any of its rehearsals. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const p = pending!; setPending(null); commit(p); }}>Yes, continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
