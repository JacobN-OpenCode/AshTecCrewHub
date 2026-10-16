import { pv, previewId } from '../lib/preview';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getMyEvents, setAttendance, type GetMyEventsOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import ShowCard from '../components/ShowCard';
import SubEventRow, { type MySubEvent } from '../components/SubEventRow';
import ReasonDialog from '../components/ReasonDialog';
import UpcomingBirthdays from '../components/UpcomingBirthdays';
import OpeningCountdown from '../components/OpeningCountdown';
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
  // Ticket 57ce12eb: club sessions no longer count as "to respond to" - members
  // just see them and attendance is taken at the venue.
  const todo = pendingShows + pendingEvents;

  // firstName is just an initial after the rename (max 2 chars) so we have to
  // join it back with the last name for the greeting; otherwise every member
  // saw "Hi L 👋" instead of "Hi L Paice 👋". Falls back to a single initial
  // when no surname is set yet.
  const who = `${me.firstName}${me.lastName ? ' ' + me.lastName : ''}`;

  // Ticket 00c0715c: contractors are external, so their home is just the events
  // they have been invited to and their own attendance - no show line-up.
  if (me.memberType === 'Contractor') return <ContractorInvites events={data.subEvents} who={who} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {who} 👋</h1>
        <p className="text-muted-foreground mt-1">
          {todo ? <>You have <span className="text-primary font-semibold">{todo}</span> thing{todo > 1 ? 's' : ''} to respond to.</> : 'You’re all caught up.'}
        </p>
      </div>
      {data.shows.length === 0 && <p className="text-muted-foreground">No shows have been set up yet.</p>}
      <OpeningCountdown />
      <UpcomingBirthdays />
      {data.shows.map((s) => (
        <ShowCard key={s.id} show={s} events={data.subEvents.filter((e) => e.showIds.includes(s.id))} reload={reload} />
      ))}
      <ClubSessions events={clubSessions} />
    </div>
  );
}

/**
 * Ticket 57ce12eb. Club sessions belong to no show, so they get their own block
 * instead of a ShowCard. Members no longer respond yes/no: they just see the
 * session. Attendance is taken at the venue by taking a register, so the row is
 * read-only here.
 */
function ClubSessions({ events }: { events: MySubEvent[] }) {
  if (!events.length) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Club sessions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Regular club meetings. There is nothing to sign up for; attendance is taken at the door.
        </p>
      </div>
      {events.map((e) => <SubEventRow key={e.id} ev={e} readOnly />)}
    </section>
  );
}

/**
 * Contractor home (ticket 00c0715c). Shows only the events they have been
 * invited to, each with the admin's invitation message and their own
 * attendance choice. They never see the stage layout or anyone else's data.
 */
function ContractorInvites({ events, who }: { events: MySubEvent[]; who: string }) {
  const [statuses, setStatuses] = useState<Record<string, string | null>>(
    () => Object.fromEntries(events.map((e) => [e.id, e.status ?? null])),
  );
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<MySubEvent | null>(null);
  const pending = events.filter((e) => !statuses[e.id] && !isPastDue(e.dueDate, e.dueUnknown)).length;

  const setStatus = async (id: string, status: 'Expected Arrival' | 'Maybe' | 'Not Attending', reason?: string) => {
    setBusy(true);
    try {
      await setAttendance({ items: [{ subEventId: id, status, reason }], memberId: previewId() ?? undefined });
      setStatuses((s) => ({ ...s, [id]: status }));
      toast.success('Attendance saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {who} 👋</h1>
        <p className="text-muted-foreground mt-1">
          {events.length === 0
            ? 'You have no event invitations right now.'
            : pending
              ? <>You have <span className="text-primary font-semibold">{pending}</span> invitation{pending > 1 ? 's' : ''} to respond to.</>
              : 'You’re all caught up.'}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-muted-foreground">When an admin invites you to an event it will appear here, with the details, a message for you, and your own attendance.</p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Your invitations</h2>
          {events.map((e) => (
            <SubEventRow
              key={e.id}
              ev={{ ...e, status: statuses[e.id] }}
              showInvite
              disabled={busy}
              onPick={(s) => (s === 'Not Attending' ? setReasonFor(e) : void setStatus(e.id, s))}
            />
          ))}
        </section>
      )}
      <ReasonDialog
        open={!!reasonFor}
        busy={busy}
        title={reasonFor ? `Can’t attend ${reasonFor.title}` : 'Can’t attend'}
        onCancel={() => setReasonFor(null)}
        onSubmit={(reason) => void setStatus(reasonFor!.id, 'Not Attending', reason)}
      />
    </div>
  );
}
