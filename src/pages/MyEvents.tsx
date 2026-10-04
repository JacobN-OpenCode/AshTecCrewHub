import { pv } from '../lib/preview';
import { useCallback, useEffect, useState } from 'react';
import { getMyEvents, type GetMyEventsOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import ShowCard from '../components/ShowCard';
import { isPastDue } from '../lib/constants';
import { useMe } from '../lib/me';

export default function MyEvents() {
  const { me } = useMe();
  const [data, setData] = useState<GetMyEventsOutputType | null>(null);
  const reload = useCallback(async () => setData(await getMyEvents(pv())), []);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>;

  const pendingShows = data.shows.filter((s) => !s.response && !isPastDue(s.dueDate, s.dueUnknown)).length;
  const pendingEvents = data.subEvents.filter((e) => {
    const inShow = data.shows.some((s) => e.showIds.includes(s.id) && (s.response === 'Yes' || s.response === 'Maybe'));
    return inShow && !e.status && !isPastDue(e.dueDate, e.dueUnknown);
  }).length;
  const todo = pendingShows + pendingEvents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hi {me.firstName} 👋</h1>
        <p className="text-muted-foreground mt-1">
          {todo ? <>You have <span className="text-primary font-semibold">{todo}</span> thing{todo > 1 ? 's' : ''} to respond to.</> : 'You’re all caught up.'}
        </p>
      </div>
      {data.shows.length === 0 && <p className="text-muted-foreground">No shows have been set up yet.</p>}
      {data.shows.map((s) => (
        <ShowCard key={s.id} show={s} events={data.subEvents.filter((e) => e.showIds.includes(s.id))} reload={reload} />
      ))}
    </div>
  );
}
