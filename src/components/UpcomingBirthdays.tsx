import { useEffect, useState } from 'react';
import { getBirthdays, type GetBirthdaysOutputType } from '#api';
import { Cake } from 'lucide-react';

type Bday = GetBirthdaysOutputType['birthdays'][number];

/**
 * A small crew birthday strip. Month/day only (we never store a year), so it is
 * about the shout-out, not the age. Today's are highlighted; the rest are "in X
 * days". Renders nothing when nobody has a birthday coming up, or when the
 * caller is not allowed to read it.
 */
export default function UpcomingBirthdays() {
  const [birthdays, setBirthdays] = useState<Bday[]>([]);

  useEffect(() => {
    let live = true;
    getBirthdays({ days: 30 })
      .then((r) => { if (live) setBirthdays(r.birthdays); })
      .catch(() => { /* members-only; stay quiet for anyone else */ });
    return () => { live = false; };
  }, []);

  if (!birthdays.length) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Cake className="h-4 w-4 text-pink-400" />
        <h2 className="font-semibold">Birthdays</h2>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {birthdays.map((b) => (
          <span
            key={b.id}
            className={
              b.isToday
                ? 'text-sm px-3 py-1.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40'
                : 'text-sm px-3 py-1.5 rounded-full bg-muted'
            }
          >
            {b.firstName}{b.lastName ? ' ' + b.lastName : ''}
            <span className="text-muted-foreground ml-1.5">
              {b.isToday ? '🎉 today' : `in ${b.inDays} day${b.inDays === 1 ? '' : 's'}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
