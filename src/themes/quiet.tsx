import { Link } from 'react-router-dom';
import { LogOut, Search, Palette } from 'lucide-react';
import { flatNav, initials, type ShellProps } from './types';
import { clock, dayMonth, greeting, useDash, weekday } from '../lib/dash';

/** A line of small pine trees, drawn rather than imported. */
function Pines() {
  const trees = Array.from({ length: 26 }, (_, i) => {
    const h = 18 + ((i * 7) % 13);
    const lean = ((i * 5) % 7) - 3;
    const x = 14 + i * 46;
    return (
      <g key={i} transform={`translate(${x} 60)`}>
        <path d={`M0 0 L${-6 + lean} -${h * 0.45} L${6 + lean} -${h * 0.45} Z`} />
        <path d={`M0 -${h * 0.3} L${-8 + lean} -${h * 0.8} L${8 + lean} -${h * 0.8} Z`} />
        <path d={`M0 -${h * 0.62} L${-5 + lean} -${h} L${5 + lean} -${h} Z`} />
        <line x1="0" y1="0" x2="0" y2="4" />
      </g>
    );
  });
  return (
    <svg viewBox="0 0 1200 64" preserveAspectRatio="none" className="h-12 w-full text-[#9aa890]" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">{trees}</g>
    </svg>
  );
}

/**
 * Quiet Place: no sidebar at all. A serif wordmark and one quiet row of links
 * across the top, pines drawn underneath, then a single measured column of
 * writing. Nothing floats, nothing casts a shadow.
 */
export function Shell({ groups, me, platformName, onSearch, onSignOut, children }: ShellProps) {
  const items = flatNav(groups);
  return (
    <div className="min-h-screen bg-[#f7f4ec] text-[#2f352f]">
      <header className="border-b border-[#e2ddcc] bg-[#f7f4ec]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4">
          <Link to="/" className="font-serif text-xl tracking-tight">{platformName}</Link>
          <nav className="hidden min-w-0 flex-1 items-center gap-5 overflow-x-auto lg:flex">
            {items.slice(0, 8).map((i) => (
              <Link key={i.to} to={i.to} className="whitespace-nowrap text-sm text-[#5d665c] transition-colors hover:text-[#2f352f]">{i.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/theme" title="Themes" aria-label="Themes" className="text-[#5d665c] hover:text-[#2f352f]"><Palette className="h-4 w-4" /></Link>
            <button type="button" onClick={onSearch} title="Search" className="text-[#5d665c] hover:text-[#2f352f]"><Search className="h-4 w-4" /></button>
            <Link to="/profile" title="My settings" className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfc9b4] font-serif text-xs">{initials(me.firstName, me.lastName)}</Link>
            <button type="button" onClick={onSignOut} title="Sign out" className="text-[#8b938a] hover:text-[#2f352f]"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        <Pines />
      </header>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 lg:pb-16">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-[#e2ddcc] bg-[#f7f4ec]/95 py-2 backdrop-blur lg:hidden">
        {items.slice(0, 4).map((i) => (
          <Link key={i.to} to={i.to} className="px-3 py-1 text-[11px] text-[#5d665c]">{i.label}</Link>
        ))}
      </nav>
    </div>
  );
}

/** Three months of days, filled where something is happening. */
function Heatmap({ dates }: { dates: string[] }) {
  const on = new Set(dates);
  const start = new Date();
  start.setDate(start.getDate() - 7 * 11);
  const cells = Array.from({ length: 12 * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1">
      {cells.map((d, i) => {
        const iso = d.toISOString().slice(0, 10);
        return (
          <span
            key={i}
            title={d.toDateString()}
            className={`h-2.5 w-2.5 rounded-[2px] ${on.has(iso) ? 'bg-[#7d8f6f]' : 'bg-[#e6e1d1]'}`}
          />
        );
      })}
    </div>
  );
}

export function Dash() {
  const d = useDash();
  const dates = (d.upcoming ?? []).map((e) => e.date).filter((x): x is string => !!x);
  return (
    <div className="space-y-12">
      <header>
        <p className="font-serif text-sm uppercase tracking-[0.18em] text-[#8b938a]">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">{greeting()}, {d.me.firstName}.</h1>
        <p className="mt-3 max-w-lg text-[#5d665c]">
          {d.pending && d.pending.length > 0
            ? `${d.pending.length} thing${d.pending.length === 1 ? '' : 's'} still to answer. Take them one at a time.`
            : 'Everything answered. A good day for it.'}
        </p>
        <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#e2ddcc] bg-[#fbf9f2] px-4 py-1.5 text-sm text-[#5d665c]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7d8f6f]" />
          {d.upcoming?.length ?? 0} on the calendar · {d.news?.length ?? 0} notices
        </div>
      </header>

      <section>
        <h2 className="font-serif text-xl">Coming up</h2>
        {d.upcoming === null ? <p className="mt-4 text-sm text-[#8b938a]">Reading the calendar…</p> : d.upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-[#8b938a]">Nothing yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#e2ddcc] border-y border-[#e2ddcc]">
            {d.upcoming.map((e) => (
              <li key={e.id} className="flex items-baseline gap-5 py-3">
                <span className="w-24 shrink-0 font-serif text-sm text-[#8b938a]">{dayMonth(e.date)}</span>
                <span className="flex-1">
                  <span className="block text-[15px]">{e.title}</span>
                  <span className="text-xs text-[#8b938a]">{weekday(e.date)}{e.startTime ? `, ${clock(e.startTime)}` : ''} · {e.type}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-xl">Still to answer</h2>
        {d.pending === null ? <p className="mt-3 text-sm text-[#8b938a]">Checking…</p> : d.pending.length === 0 ? (
          <p className="mt-3 text-sm text-[#8b938a]">Nothing waiting. Enjoy it.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.pending.map((f) => (
              <li key={`${f.kind}-${f.id}`} className="flex items-center gap-3 text-[15px]">
                <span className="flex h-4 w-4 shrink-0 rounded-[4px] border border-[#b9b39d]" />
                <span className="flex-1">{f.title}</span>
                <span className="text-xs text-[#8b938a]">due {dayMonth(f.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-serif text-xl">The term so far</h2>
          <p className="mb-4 mt-1 text-sm text-[#8b938a]">Filled squares are days with something on.</p>
          <Heatmap dates={dates} />
        </div>
        <div>
          <h2 className="font-serif text-xl">Notices</h2>
          <div className="mt-3 space-y-3">
            {(d.news ?? []).slice(0, 3).map((n) => (
              <div key={n.id} className="border-l-2 border-[#cfc9b4] pl-3">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-[#8b938a]">{n.body}</p>
              </div>
            ))}
            {d.news !== null && d.news.length === 0 && <p className="text-sm text-[#8b938a]">No notices.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
