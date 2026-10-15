import { useEffect, useMemo, useState } from 'react';
import { getLeaderboard, type GetLeaderboardOutputType } from '#api';
import { Skeleton } from '@project/components/ui/skeleton';
import MemberAvatar from '../components/MemberAvatar';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { Trophy } from 'lucide-react';

type Row = GetLeaderboardOutputType['rows'][number];
type Badge = GetLeaderboardOutputType['badges'][number];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { me } = useMe();
  const [data, setData] = useState<GetLeaderboardOutputType | null>(null);
  const [tab, setTab] = useState<'hours' | 'badges'>('hours');

  useEffect(() => {
    let live = true;
    getLeaderboard({}).then((d) => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const badgeById = useMemo<Map<string, Badge>>(
    () => new Map((data?.badges ?? []).map((b) => [b.id, b])),
    [data],
  );

  if (!data) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>;

  const top = data.rows.slice(0, 3);

  return (
    <div className="space-y-6 hc-stagger">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Trophy className="h-7 w-7 text-amber-400" />Crew leaderboard</h1>
        <p className="text-muted-foreground mt-1">
          Hours come from the events you were marked down to attend that have a start and end time. Everything is public to the crew.
          {data.me && <> You’re <span className="text-primary font-semibold">#{data.me.rank}</span> with {data.me.hours}h across {data.me.events} event{data.me.events === 1 ? '' : 's'}.</>}
        </p>
        {data.pastEvents === 0 && data.upcomingEvents > 0 && (
          <p className="text-sm text-muted-foreground mt-2 rounded-xl border bg-muted/30 px-3 py-2">
            No timed events have finished yet this season, so every total is 0 for now. It fills in as the {data.upcomingEvents} scheduled event{data.upcomingEvents === 1 ? '' : 's'} happen.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('hours')} className={cn('px-4 py-2 rounded-xl border text-sm font-medium', tab === 'hours' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>Hours</button>
        <button onClick={() => setTab('badges')} className={cn('px-4 py-2 rounded-xl border text-sm font-medium', tab === 'badges' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>Badges</button>
      </div>

      {tab === 'hours' ? (
        <>
          {top.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {top.map((r, i) => (
                <div key={r.id} className={cn('rounded-2xl border bg-card p-5 text-center', i === 0 && 'border-amber-400/40')}>
                  <div className="text-3xl">{MEDALS[i]}</div>
                  <div className="mt-2 flex flex-col items-center gap-1.5">
                    <MemberAvatar url={r.avatarUrl} firstName={r.firstName} lastName={r.lastName} size="lg" />
                    <span className="font-semibold">{r.firstName}{r.lastName ? ' ' + r.lastName : ''}</span>
                    <span className="text-sm text-muted-foreground">{r.year}</span>
                  </div>
                  <div className="mt-3 text-2xl font-bold">{r.hours}h</div>
                  <div className="text-xs text-muted-foreground">{r.events} event{r.events === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium w-12">#</th>
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="px-3 py-2 font-medium text-right">Hours</th>
                    <th className="px-3 py-2 font-medium text-right">Events</th>
                    <th className="px-3 py-2 font-medium">Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn('border-b last:border-0', r.id === me.id && 'bg-primary/5')}>
                      <td className="px-3 py-2 text-muted-foreground">{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MemberAvatar url={r.avatarUrl} firstName={r.firstName} lastName={r.lastName} size="sm" />
                          <span className="font-medium">{r.firstName}{r.lastName ? ' ' + r.lastName : ''}</span>
                          {r.id === me.id && <span className="text-xs text-primary">you</span>}
                          {r.year && <span className="text-xs text-muted-foreground">{r.year}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{r.hours}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{r.events}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-0.5">
                          {r.badgeIds.slice(0, 6).map((id) => {
                            const b = badgeById.get(id);
                            return b ? <span key={id} title={b.label}>{b.emoji}</span> : null;
                          })}
                          {r.badgeIds.length > 6 && <span className="text-xs text-muted-foreground ml-1">+{r.badgeIds.length - 6}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No attendance yet. Hours appear once events are marked off.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.badges.map((b) => {
              const holders = data.rows.filter((r) => r.badgeIds.includes(b.id)).length;
              return (
                <div key={b.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{b.emoji}</span>
                    <div>
                      <div className="font-semibold">{b.label}</div>
                      <div className="text-xs text-muted-foreground">{holders} of {data.rows.length} crew</div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{b.description}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {data.rows.filter((r) => r.badgeIds.includes(b.id)).slice(0, 8).map((r) => (
                      <MemberAvatar key={r.id} url={r.avatarUrl} firstName={r.firstName} lastName={r.lastName} size="sm" title={`${r.firstName} ${r.lastName}`} />
                    ))}
                    {holders > 8 && <span className="text-xs text-muted-foreground self-center">+{holders - 8}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
