import { useEffect, useState } from 'react';
import { getLeaderboard, type GetLeaderboardOutputType } from '#api';
import { Link } from 'react-router-dom';
import { cn } from '@project/components/lib/utils';
import { Award } from 'lucide-react';

type Badge = GetLeaderboardOutputType['badges'][number];
type Me = NonNullable<GetLeaderboardOutputType['me']>;

/**
 * The member's own badges and hours, pulled from the leaderboard so the numbers
 * match the public board exactly. Renders nothing until loaded, and nothing at
 * all if the call fails (e.g. a contractor who should not see the board).
 */
export default function MyBadges() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<Badge[]>([]);

  useEffect(() => {
    let live = true;
    getLeaderboard({})
      .then((d) => {
        if (!live || !d.me) return;
        const byId = new Map(d.badges.map((b) => [b.id, b]));
        setMe(d.me);
        setCatalog(d.badges);
        setBadges(d.me.badgeIds.map((id) => byId.get(id)).filter((b): b is Badge => !!b));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!me) return null;

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2"><Award className="h-5 w-5 text-amber-400" />Badges</h2>
        <Link to="/leaderboard" className="text-sm underline text-muted-foreground hover:text-foreground">Leaderboard</Link>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="text-foreground font-semibold">{me.hours}h</span> across {me.events} event{me.events === 1 ? '' : 's'} · rank #{me.rank} · {badges.length} of {catalog.length} badges
      </p>
      {badges.length === 0 ? (
        <p className="text-sm text-muted-foreground">No badges yet. Attend an event to earn your first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b.id} title={b.description} className={cn('text-sm px-3 py-1.5 rounded-full border bg-muted/40')}>
              {b.emoji} {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
