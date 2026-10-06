import { pv, previewId } from '../lib/preview';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getMyEvents, setAttendance, type GetMyEventsOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import ShowCard from '../components/ShowCard';
import SubEventRow, { type MySubEvent } from '../components/SubEventRow';
import ReasonDialog from '../components/ReasonDialog';
import { isPastDue } from '../lib/constants';
import { useMe } from '../lib/me';

export default function MyEvents() {
  const { me } = useMe();
  const [data, setData] = useState<GetMyEventsOutputType | null>(null);
  const reload = useCallback(async () => setData(await getMyEvents(pv())), []);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>;

  const clubSessions = data.subEvents.filter((e) => e.type === 'Club Session');
  const pendingShows = data.shows.filter((s) => !s.response && !isPastDue(s.dueDate, s.dueUnknown)).length;
  const pendingEvents = data.subEvents.filter((e) => {
    const inShow = data.shows.some((s) => e.showIds.includes(s.id) && (s.response === 'Yes' || s.response === 'Maybe'));
    return inShow && !e.status && !isPastDue(e.dueDate, e.dueUnknown);
  }).length;
  const pendingClubs = clubSessions.filter((e) => !e.status && !isPastDue(e.dueDate, e.dueUnknown)).length;
  const todo = pendingShows + pendingEvents + pendingClubs;

  // firstName is just an initial after the rename (max 2 chars) so we have to
  // join it back with the last name for the greeting; otherwise every member
  // saw "Hi L 👋" instead of "Hi L Paice 👋". Falls back to a single initial
  // when no surname is set yet.
  const who = `${me.firstName}${me.lastName ? ' ' + me.lastName : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {who} 👋</h1>
        <p className="text-muted-foreground mt-1">
          {todo ? <>You have <span className="text-primary font-semibold">{todo}</span> thing{todo > 1 ? 's' : ''} to respond to.</> : 'You’re all caught up.'}
        </p>
      </div>
      {data.shows.length === 0 && <p className="text-muted-foreground">No shows have been set up yet.</p>}
      {data.shows.map((s) => (
        <ShowCard key={s.id} show={s} events={data.subEvents.filter((e) => e.showIds.includes(s.id))} reload={reload} />
      ))}
      <ClubSessions events={clubSessions} reload={reload} />
    </div>
  );
}

/**
 * Ticket 43e07671. Club sessions belong to no show, so they get their own block
 * instead of a ShowCard. The RSVP is per session, using the same attendance the
 * rest of the app records, including the written reason for a "can't go".
 */
function ClubSessions({ events, reload }: { events: MySubEvent[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<MySubEvent | null>(null);
  if (!events.length) return null;

  const commit = async (subEventId: string, status: 'Expected Arrival' | 'Maybe' | 'Not Attending', reason?: string) => {
    setBusy(true);
    try {
      await setAttendance({ items: [{ subEventId, status, reason }], memberId: previewId() });
      toast.success('Saved');
      await reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setReasonFor(null); }
  };
  const pick = (ev: MySubEvent, status: 'Expected Arrival' | 'Maybe' | 'Not Attending') =>
    status === 'Not Attending' ? setReasonFor(ev) : void commit(ev.id, status);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Club sessions</h2>
        <p className="text-sm text-muted-foreground mt-1">Regular club meetings, scheduled separately from shows.</p>
      </div>
      {events.map((e) => <SubEventRow key={e.id} ev={e} disabled={busy} onPick={(s) => pick(e, s)} />)}
      <ReasonDialog
        open={!!reasonFor}
        busy={busy}
        title={reasonFor ? `Can’t attend ${reasonFor.title}` : 'Can’t attend'}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => void commit(reasonFor!.id, 'Not Attending', reason)}
      />
    </section>
  );
}
