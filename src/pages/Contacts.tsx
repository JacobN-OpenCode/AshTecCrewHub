import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getContactSheet, type GetContactSheetOutputType } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { BookUser, Mail, Search } from 'lucide-react';

type Person = GetContactSheetOutputType['people'][number];

/**
 * Ticket 19ffa650: the sheet the Settings switch kept talking about. Only
 * people who turned that switch on appear here, and the switch is the only way
 * in or out, so nobody is listed by accident.
 */
export default function Contacts() {
  const [data, setData] = useState<GetContactSheetOutputType | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getContactSheet({}));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => {
    const list = data?.people ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((p: Person) =>
      [p.name, p.year, p.email, ...p.roles].join(' ').toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contact sheet</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The crew who chose to share their school email, so you can reach them about a prop, a cable, or a lift home
            after a late one. Nobody is on here unless they turned it on themselves.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/profile">Your settings</Link>
        </Button>
      </header>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</div>
      )}

      {data && !data.on && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <BookUser className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-muted-foreground">
            You are not on the sheet. Turn on <span className="font-medium text-foreground">Contact sheet</span> in{' '}
            <Link to="/profile" className="underline hover:text-foreground">
              your settings
            </Link>{' '}
            to add your school email.
          </p>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search a name, year or role…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!data && !error && <Skeleton className="h-40 rounded-2xl" />}

      {data && people.length === 0 && (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="font-semibold">{q.trim() ? 'Nobody matches that' : 'The sheet is empty'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q.trim()
              ? 'Try a first name, or clear the search.'
              : 'When people turn on the Contact sheet switch in their settings, they show up here.'}
          </p>
        </div>
      )}

      {people.length > 0 && (
        <ul className="divide-y rounded-2xl border bg-card">
          {people.map((p: Person) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {(p.firstName || p.name).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">{p.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {p.year && <span>{p.year}</span>}
                  {p.roles.slice(0, 3).map((r) => (
                    <Badge key={r} variant="outline" className="font-normal">
                      {r}
                    </Badge>
                  ))}
                </p>
              </div>
              <a
                href={`mailto:${p.email}`}
                className="flex shrink-0 items-center gap-1.5 text-sm underline hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{p.email}</span>
                <span className="sm:hidden">Email</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        School email addresses only, shared deliberately. Nothing here is visible to parents or anyone outside the crew.
      </p>
    </div>
  );
}
