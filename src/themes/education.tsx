import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, ChevronRight, LogOut, Search } from 'lucide-react';
import { flatNav, initials, type ShellProps } from './types';
import { clock, dayMonth, greeting, useDash, weekday } from '../lib/dash';

/**
 * Education: the whole app is one white shell floating on a pink-to-mint
 * gradient. Navigation runs across the top of the shell as pills, there is no
 * sidebar, and the page inside has its own generous padding.
 */
export function Shell({ groups, me, platformName, onSearch, onSignOut, children }: ShellProps) {
  const items = flatNav(groups);
  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#ffd9e6_0%,#ffe7ef_38%,#dff5e8_100%)] p-3 sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col rounded-[32px] bg-white shadow-[0_40px_90px_-50px_rgba(40,40,60,0.55)]">
        <header className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#141414] text-xs text-white">{platformName.slice(0, 1)}</span>
            {platformName}
          </Link>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pb-1 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:justify-center lg:pb-0">
            {items.slice(0, 7).map((i) => {
              const on = location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to));
              return (
                <Link key={i.to} to={i.to}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${on ? 'bg-[#141414] text-white' : 'text-[#4b4b4b] hover:bg-[#f4f4f4]'}`}>
                  {i.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onSearch} className="rounded-full p-2 text-[#4b4b4b] hover:bg-[#f4f4f4]"><Search className="h-4 w-4" /></button>
            <Link to="/profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f4f4] text-xs font-semibold">{initials(me.firstName, me.lastName)}</Link>
            <button type="button" onClick={onSignOut} className="rounded-full p-2 text-[#8a8a8a] hover:bg-[#f4f4f4]"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="flex-1 px-5 pb-28 pt-2 sm:px-8 lg:pb-10">{children}</div>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-3xl bg-white/95 px-2 py-2 shadow-lg backdrop-blur lg:hidden">
        {items.slice(0, 4).map((i) => (
          <Link key={i.to} to={i.to} className="px-3 py-1 text-[11px] text-[#4b4b4b]">{i.label}</Link>
        ))}
      </nav>
    </div>
  );
}

const TINTS = ['bg-[#dff5e8]', 'bg-[#ffe0ea]', 'bg-[#fff3cc]', 'bg-[#ece4ff]'];

export function Dash() {
  const d = useDash();
  const tiles = [
    { label: 'Coming up', value: d.upcoming?.length ?? 0 },
    { label: 'Forms to fill', value: d.pending?.length ?? 0 },
    { label: 'Open tickets', value: d.openTickets ?? 0 },
    { label: 'Notices', value: d.news?.length ?? 0 },
  ];
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    const iso = dt.toISOString().slice(0, 10);
    return { iso, dt, busy: (d.upcoming ?? []).some((e) => e.date === iso) };
  });
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Welcome back {d.me.firstName} <span aria-hidden>👋</span></h1>
          <p className="mt-1 text-sm text-[#6b6b6b]">Here is where the crew is up to today.</p>
        </div>
        <Link to="/calendar" className="inline-flex items-center gap-2 rounded-full bg-[#141414] px-4 py-2 text-sm font-medium text-white">Open calendar <ArrowUpRight className="h-4 w-4" /></Link>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label} className={`relative rounded-[26px] p-5 ${TINTS[i]}`}>
            <p className="text-xs font-medium text-black/55">{t.label}</p>
            <p className="mt-3 text-3xl font-semibold">{t.value}</p>
            <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#141414]"><ArrowUpRight className="h-4 w-4" /></span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="rounded-[26px] border border-[#eee] p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">This week</h2>
            <span className="text-xs text-[#8a8a8a]">{new Date().toLocaleDateString('en-GB', { month: 'long' })}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => (
              <div key={day.iso} className={`rounded-2xl px-1 py-2 text-center ${day.busy ? 'bg-[#ffe0ea]' : 'bg-[#f7f7f7]'}`}>
                <p className="text-[10px] uppercase text-[#8a8a8a]">{day.dt.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</p>
                <p className="text-sm font-semibold">{day.dt.getDate()}</p>
                <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${day.busy ? 'bg-[#f06595]' : 'bg-transparent'}`} />
              </div>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-[#f0f0f0]">
            {d.upcoming === null ? <li className="py-3 text-sm text-[#8a8a8a]">Loading…</li> : d.upcoming.length === 0 ? <li className="py-3 text-sm text-[#8a8a8a]">Nothing booked.</li> : d.upcoming.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="rounded-full bg-[#f7f7f7] px-2 py-0.5 text-[11px] text-[#6b6b6b]">{dayMonth(e.date)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#c4c4c4]" />
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="rounded-[26px] bg-[#f7f7f7] p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" /> Needs you</h2>
            {(d.pending ?? []).length === 0 ? <p className="text-sm text-[#8a8a8a]">Nothing waiting on you.</p> : (
              <ul className="space-y-2">
                {(d.pending ?? []).slice(0, 4).map((f) => (
                  <li key={`${f.kind}-${f.id}`} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <span className="shrink-0 text-[11px] text-[#8a8a8a]">{dayMonth(f.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(d.news ?? []).slice(0, 2).map((n) => (
            <div key={n.id} className="rounded-[26px] bg-[#fff3cc] p-5">
              <p className="text-[11px] uppercase tracking-wide text-black/50">Notice</p>
              <p className="mt-1 text-sm font-medium">{n.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-black/60">{n.body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
