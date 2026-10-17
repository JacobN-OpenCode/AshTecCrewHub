import { useEffect, useState } from 'react';
import { getMemories, type GetMemoriesOutputType } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { Camera, Images, MessageSquareQuote, Sparkles } from 'lucide-react';

type Data = GetMemoriesOutputType;
type ShowMem = Data['shows'][number];

/**
 * The show memories wall (Batch 8): every run's backstage photos and the lines
 * people wrote in the debrief, gathered per show so a finished run has somewhere
 * to live. Photos are shown as a masonry-ish grid and open full size on click.
 */
export default function Memories() {
  const [data, setData] = useState<Data | null>(null);
  const [zoom, setZoom] = useState<{ url: string; caption: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try { setData(await getMemories({})); }
      catch { setData({ shows: [] }); }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-6 hc-stagger">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Images className="h-7 w-7 text-primary" />Show memories</h1>
        <p className="text-muted-foreground mt-1">Every run, kept: backstage photos and the best bits of the debrief.</p>
      </div>

      {data === null ? (
        <div className="space-y-4"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div>
      ) : data.shows.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
          <Images className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>No memories yet. Add photos or a debrief to a show and they will gather here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {data.shows.map((s) => <ShowCard key={s.id} show={s} onZoom={setZoom} />)}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setZoom(null)}>
          <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.url} alt={zoom.caption || 'Backstage photo'} className="max-h-[80vh] w-auto rounded-xl object-contain" />
            {zoom.caption && <p className="mt-3 text-center text-sm text-white/90">{zoom.caption}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ShowCard({ show, onZoom }: { show: ShowMem; onZoom: (z: { url: string; caption: string }) => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
        <div>
          <h2 className="text-xl font-semibold">{show.name}</h2>
          <p className="text-sm text-muted-foreground">
            {show.shortCode && <span className="mr-2 font-mono text-xs uppercase">{show.shortCode}</span>}
            {show.photoCount} photo{show.photoCount === 1 ? '' : 's'} · {show.quoteCount} note{show.quoteCount === 1 ? '' : 's'}
          </p>
        </div>
        {show.finished
          ? <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15"><Sparkles className="mr-1 h-3 w-3" />Run complete</Badge>
          : <Badge variant="outline">In progress</Badge>}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Photos */}
        <div>
          {show.photos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Camera className="h-4 w-4" />No photos yet.</p>
          ) : (
            <div className="columns-2 gap-2 sm:columns-3 [&>*]:mb-2">
              {show.photos.map((p) => (
                <button key={p.id} type="button" onClick={() => onZoom({ url: p.url, caption: p.caption })}
                  className="group relative block w-full overflow-hidden rounded-xl border">
                  <img src={p.url} alt={p.caption || 'Backstage photo'} loading="lazy"
                    className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  {p.caption && (
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {p.caption}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quotes */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4" />From the debrief
          </h3>
          {show.quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing written down yet.</p>
          ) : (
            <ul className="space-y-3">
              {show.quotes.map((q) => (
                <li key={q.id} className={cn('rounded-xl border-l-2 border-primary/60 bg-muted/40 p-3')}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{q.body}</p>
                  {q.authorName && <p className="mt-1 text-xs text-muted-foreground">— {q.authorName}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
