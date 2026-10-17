import { useEffect, useState } from 'react';
import { getMyBadges, type GetMyBadgesOutputType } from '#api';
import { cn } from '@project/components/lib/utils';
import { Award } from 'lucide-react';

type Badge = GetMyBadgesOutputType['badges'][number];

/**
 * The member's own badges. Feedback round 2: the leaderboard is gone, so this
 * no longer shows hours or a rank — just the badges you have earned. Renders
 * nothing until loaded, and nothing at all if the call fails.
 */
export default function MyBadges() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    getMyBadges({})
      .then((d) => {
        if (!live) return;
        const byId = new Map(d.badges.map((b) => [b.id, b]));
        setBadges(d.mine.map((id) => byId.get(id)).filter((b): b is Badge => !!b));
        setTotal(d.badges.length);
        setLoaded(true);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2"><Award className="h-5 w-5 text-amber-400" />Badges</h2>
        <span className="text-sm text-muted-foreground">{badges.length} of {total}</span>
      </div>
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
