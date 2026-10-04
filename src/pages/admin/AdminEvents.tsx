import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminDeleteSubEvent, adminSaveShow } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { EyeOff, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { useAdminData, type AdminSubEvent } from '../../lib/useAdminData';
import { dueLabel, fmtDate, IMPORTANCE_STYLE } from '../../lib/constants';
import ShowDialog from '../../components/admin/ShowDialog';
import SubEventDialog from '../../components/admin/SubEventDialog';
import AttendanceSheet from '../../components/admin/AttendanceSheet';

/** Synthetic tab id for the club-session category, which has no show row. */
const CLUB = '__club__';

export default function AdminEvents() {
  const { data, reload } = useAdminData();
  const [showId, setShowId] = useState<string>('');
  const [showDlg, setShowDlg] = useState<'new' | 'edit' | null>(null);
  const [evDlg, setEvDlg] = useState<{ ev: AdminSubEvent | null; club?: boolean } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'show' | 'ev'; id: string; name: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    if (showId === CLUB) return;
    if (!data.shows.some((s) => s.id === showId)) setShowId(data.shows[0]?.id ?? CLUB);
  }, [data, showId]);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;

  const onClub = showId === CLUB;
  const show = data.shows.find((s) => s.id === showId);
  // Club sessions are the events with no show, so they get their own tab.
  const events = onClub
    ? data.subEvents.filter((e) => e.type === 'Club Session')
    : data.subEvents.filter((e) => e.showIds.includes(showId));
  const resp = onClub ? [] : data.responses.filter((r) => r.showId === showId);
  const rc = (r: string) => resp.filter((x) => x.response === r).length;
  const cnt = (id: string, s: string) => data.attendance.filter((a) => a.subEventId === id && a.status === s).length;

  const doDelete = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'ev') await adminDeleteSubEvent({ id: confirm.id });
      else await adminSaveShow({ id: confirm.id, delete: true });
      toast.success('Deleted'); await reload();
    } catch (e) { toast.error((e as Error).message); }
    setConfirm(null);
  };

  const EventRow = ({ e }: { e: AdminSubEvent }) => (
    <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{e.title}</span>
          <Badge variant="outline" className={e.type === 'Performance' ? 'border-pink-500/40 text-pink-400' : e.type === 'Club Session' ? 'border-emerald-500/40 text-emerald-400' : 'border-sky-500/40 text-sky-400'}>{e.subtype || e.type}</Badge>
          <Badge variant="outline" className={IMPORTANCE_STYLE[e.importance]}>{e.importance}</Badge>
          {e.hidden && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400" title="Hidden from members">
              <EyeOff className="h-3 w-3 mr-1" />Hidden
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{fmtDate(e.date, e.dateTbc)}{e.meetTime && ` · Meet ${e.meetTime}`} · <span className="font-mono text-xs">{dueLabel(e.dueDate, e.dueUnknown)}</span></p>
      </div>
      <div className="flex items-center gap-3 text-sm font-mono">
        <span className="text-emerald-400" title="Expected arrival">✓ {cnt(e.id, 'Expected Arrival')}</span>
        <span className="text-yellow-400" title="Maybe">? {cnt(e.id, 'Maybe')}</span>
        <span className="text-red-400" title="Not attending">✕ {cnt(e.id, 'Not Attending') + cnt(e.id, 'Not Attending Event')}</span>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setViewing(e.id)}><Users className="h-4 w-4 mr-1" />Attendance</Button>
        <Button size="icon" variant="ghost" onClick={() => setEvDlg({ ev: e })}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setConfirm({ kind: 'ev', id: e.id, name: e.title })}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Manage Events</h1>
        <Button data-tour="events-new" variant="outline" onClick={() => setShowDlg('new')}><Plus className="h-4 w-4 mr-1" />New show</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {data.shows.map((s) => (
          <button key={s.id} onClick={() => setShowId(s.id)}
            title={s.hidden ? 'Hidden from members' : undefined}
            className={cn('px-4 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5',
              s.id === showId ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted',
              s.hidden && s.id !== showId && 'opacity-60 border-dashed')}>
            {s.hidden && <EyeOff className="h-3.5 w-3.5" />}
            {s.name}{s.code && <span className="ml-1.5 font-mono opacity-70">{s.code}</span>}
          </button>
        ))}
        <button onClick={() => setShowId(CLUB)}
          className={cn('px-4 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-1.5',
            onClub ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-muted')}>
          Club sessions
        </button>
      </div>
      {onClub ? (
        <>
          <div className="rounded-2xl border bg-card p-5 flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Club sessions</h2>
              <p className="text-sm text-muted-foreground mt-1">Regular club meetings, scheduled separately from shows.</p>
            </div>
            <Button onClick={() => setEvDlg({ ev: null, club: true })}><Plus className="h-4 w-4 mr-1" />Add club session</Button>
          </div>
          <div className="rounded-2xl border bg-card divide-y">
            {events.length === 0 && <p className="p-6 text-sm text-muted-foreground">No club sessions yet.</p>}
            {events.map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        </>
      ) : show && (
        <>
          <div className="rounded-2xl border bg-card p-5 flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{show.name}</h2>
              <p className="text-xs font-mono text-muted-foreground mt-1">{dueLabel(show.dueDate, show.dueUnknown)}</p>
              <div className="flex flex-wrap gap-2 mt-3 text-sm">
                {show.hidden && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                    <EyeOff className="h-3 w-3 mr-1" />Hidden from members
                  </Badge>
                )}
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Yes {rc('Yes')}</Badge>
                <Badge variant="outline" className="border-yellow-500/40 text-yellow-400">Maybe {rc('Maybe')}</Badge>
                <Badge variant="outline" className="border-red-500/40 text-red-400">No {rc('No')}</Badge>
                <Badge variant="outline">No reply {data.members.length - resp.length}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDlg('edit')}><Pencil className="h-4 w-4 mr-1" />Edit show</Button>
              <Button variant="outline" onClick={() => setConfirm({ kind: 'show', id: show.id, name: show.name })}><Trash2 className="h-4 w-4" /></Button>
              <Button onClick={() => setEvDlg({ ev: null })}><Plus className="h-4 w-4 mr-1" />Add rehearsal / performance</Button>
            </div>
          </div>
          <div className="rounded-2xl border bg-card divide-y">
            {events.length === 0 && <p className="p-6 text-sm text-muted-foreground">No rehearsals or performances yet.</p>}
            {events.map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        </>
      )}
      <ShowDialog open={!!showDlg} show={showDlg === 'edit' ? show ?? null : null} onClose={() => setShowDlg(null)}
        onSaved={async (id) => { setShowDlg(null); await reload(); setShowId(id); }} />
      <SubEventDialog open={!!evDlg} ev={evDlg?.ev ?? null} shows={data.shows}
        defaultShowId={evDlg?.club ? undefined : showId}
        defaultType={evDlg?.club ? 'Club Session' : undefined}
        onClose={() => setEvDlg(null)} onSaved={async () => { setEvDlg(null); await reload(); }} />
      <AttendanceSheet ev={data.subEvents.find((e) => e.id === viewing) ?? null} data={data} onClose={() => setViewing(null)} reload={reload} />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This can’t be undone{confirm?.kind === 'ev' ? ' and removes all attendance responses for it' : ''}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
