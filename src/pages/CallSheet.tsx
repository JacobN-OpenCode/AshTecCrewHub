import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { getCallSheet, type GetCallSheetOutputType } from '#api';
import { fmtDate } from '../lib/constants';

/**
 * Batch 6: a printable call sheet for one show. Each event gets its times and
 * the crew called to it, so a stage manager can print it and pin it up. The
 * `@media print` rules in index.css hide the app chrome (this page renders
 * inside the shell so the back button and nav work on screen); `print:` classes
 * here drop the screen-only bits and force black on white.
 */
export default function CallSheet() {
  const { showId = '' } = useParams();
  const [data, setData] = useState<GetCallSheetOutputType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    getCallSheet({ showId })
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [showId]);

  if (error) return <div className="p-6 text-muted-foreground">That show could not be found.</div>;
  if (!data) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-3xl print-sheet">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/show/${showId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to the show
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      <header className="mb-6 border-b-2 border-black pb-3 print:border-black">
        <h1 className="text-3xl font-bold">{data.show.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground print:text-black">
          Call sheet{data.show.code ? ` - ${data.show.code}` : ''} · {data.eventCount} event{data.eventCount === 1 ? '' : 's'} ·
          {' '}generated {new Date(data.generatedAt).toLocaleString('en-GB')}
        </p>
      </header>

      {data.events.length === 0 ? (
        <p className="text-muted-foreground">No events are attached to this show yet.</p>
      ) : (
        <div className="space-y-6">
          {data.events.map((e) => {
            const time = e.startTime || e.meetTime || '';
            return (
              <section key={e.id} className="print-avoid-break rounded-2xl border p-4 print:rounded-none print:border-black">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold">{e.title}</h2>
                  <span className="text-sm font-medium">{fmtDate(e.date, e.dateTbc)}{time ? ` · ${time}` : ''}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground print:text-black">
                  {e.type}{e.subtype ? ` (${e.subtype})` : ''}
                  {e.meetTime && e.startTime ? ` · call ${e.meetTime}` : ''}
                  {e.endTime ? ` · finish ${e.endTime}` : ''}
                </p>
                {e.thingsToBring ? (
                  <p className="mt-2 text-sm"><span className="font-semibold">Bring: </span>{e.thingsToBring}</p>
                ) : null}
                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-black">
                    Called ({e.crew.length})
                  </div>
                  {e.crew.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground print:text-black">Nobody is on the list yet.</p>
                  ) : (
                    <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3">
                      {e.crew.map((c, i) => (
                        <li key={`${c.name}-${i}`} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          {c.role ? <span className="shrink-0 text-muted-foreground print:text-black">{c.role}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
