import { OPENCODE_STATUS, type TrackState } from '../lib/opencode';
import { GitCommitHorizontal, Circle, Loader, CircleDashed, TerminalSquare } from 'lucide-react';

const STATE_STYLE: Record<TrackState, string> = {
  done: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  active: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  queued: 'border-border bg-muted/40 text-muted-foreground',
};

const STATE_LABEL: Record<TrackState, string> = {
  done: 'Done',
  active: 'Working now',
  queued: 'Queued',
};

const STATE_ICON: Record<TrackState, typeof Circle> = {
  done: Circle,
  active: Loader,
  queued: CircleDashed,
};

const STATE_RING: Record<TrackState, string> = {
  done: '',
  active: 'animate-spin',
  queued: '',
};

export default function OpenCode() {
  const s = OPENCODE_STATUS;
  const done = s.tracks.filter((t) => t.state === 'done').length;
  const pct = Math.round((done / s.tracks.length) * 100);

  return (
    <div className="min-h-screen bg-[#0a0e14] text-[#f6f2e9]">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-[#151b24]">
            <TerminalSquare className="h-5 w-5 text-[#ec3750]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#ec3750]">OpenCode</p>
            <h1 className="text-2xl font-bold tracking-tight">What I'm doing right now</h1>
          </div>
        </div>

        {/* Now card */}
        <div className="mb-6 rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-orange-400">
            <Loader className="h-4 w-4 animate-spin" /> In progress
          </p>
          <p className="text-sm leading-relaxed text-[#f6f2e9]/90">{s.now}</p>
        </div>

        {/* Headline + updated */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xl text-sm text-muted-foreground">{s.headline}</p>
          <span className="text-xs text-muted-foreground">Updated {s.updated}</span>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{s.legend}</span>
            <span>{done}/{s.tracks.length} tracks</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#ec3750] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Tracks */}
        <ol className="mb-10 space-y-3">
          {s.tracks.map((t) => {
            const Icon = STATE_ICON[t.state];
            return (
              <li
                key={t.title}
                className={`rounded-xl border p-4 transition-colors ${
                  t.state === 'active'
                    ? 'border-orange-500/40 bg-[#151b24]'
                    : 'border-border bg-[#151b24]/60 hover:border-border/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-snug">{t.title}</p>
                  <span
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATE_STYLE[t.state]}`}
                  >
                    <Icon className={`h-3 w-3 ${STATE_RING[t.state]}`} />
                    {STATE_LABEL[t.state]}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.detail}</p>
              </li>
            );
          })}
        </ol>

        {/* Shipped */}
        <div className="rounded-xl border border-border bg-[#151b24] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <GitCommitHorizontal className="h-4 w-4 text-[#ec3750]" /> Recently shipped
          </p>
          <ul className="space-y-2">
            {s.shipped.map((c) => (
              <li key={c} className="flex items-start gap-2 font-mono text-xs text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                {c}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Maintained by OpenCode · <a className="underline hover:text-foreground" href="/github">Repository</a>
        </p>
      </div>
    </div>
  );
}
