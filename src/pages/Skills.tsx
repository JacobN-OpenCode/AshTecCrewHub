import { useEffect, useMemo, useState } from 'react';
import { getSkillsDirectory, type GetSkillsDirectoryOutputType } from '#api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import MemberAvatar from '../components/MemberAvatar';
import { GraduationCap, Search, Sparkles, HandHeart } from 'lucide-react';

type Data = GetSkillsDirectoryOutputType;
type Person = Data['people'][number];

/**
 * Batch 7: the crew skills directory. "Who can teach me lighting?" is a real
 * question members actually ask, and the answer lives in people's heads, not a
 * spreadsheet. Each member tags what they can teach and what they want to learn;
 * this page makes those searchable.
 */
export default function Skills() {
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setData(await getSkillsDirectory({})); }
      catch { setData({ people: [], tags: [] }); }
    })();
  }, []);

  const people = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const matches = (list: string[], n: string) => list.some((t) => t.toLowerCase().includes(n));
    return data.people.filter((p) => {
      if (tag && !matches(p.teach, tag.toLowerCase())) return false;
      if (!needle) return true;
      return p.name.toLowerCase().includes(needle) || matches(p.teach, needle) || matches(p.learn, needle);
    });
  }, [data, q, tag]);

  return (
    <div className="space-y-6 hc-stagger">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><GraduationCap className="h-7 w-7 text-primary" />Skills</h1>
        <p className="text-muted-foreground mt-1">Who can teach you something, and what people here are keen to learn. Tag your own in Settings.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or skills…" className="pl-9" />
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {data.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.tags.map((t) => (
                <button key={t.tag} type="button" onClick={() => setTag(tag === t.tag ? null : t.tag)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    tag === t.tag ? 'border-primary bg-primary/15 text-primary' : 'bg-card hover:bg-muted/60')}>
                  {t.tag}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{t.count}</span>
                </button>
              ))}
            </div>
          )}

          {people.length === 0 ? (
            <p className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">Nobody matches. Maybe be the first to add it?</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => {
                const parts = p.name.trim().split(/\s+/);
                return (
                  <div key={p.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <MemberAvatar url={p.avatarUrl} firstName={parts[0]} lastName={parts.slice(1).join(' ')} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{[p.year, p.roles[0]].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    {p.teach.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                          <Sparkles className="h-3 w-3" />Can teach
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.teach.map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}
                        </div>
                      </div>
                    )}
                    {p.learn.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <HandHeart className="h-3 w-3" />Wants to learn
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.learn.map((t) => <Badge key={t} variant="outline" className="font-normal text-muted-foreground">{t}</Badge>)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
