import { Link } from 'react-router-dom';
import { LogOut, Search, Palette } from 'lucide-react';
import { flatNav, initials, type ShellProps } from './types';
import { clock, dayMonth, greeting, useDash, weekday } from '../lib/dash';

/** The shop cat: line art, white, red collar. Drawn here so it can sit anywhere. */
function ShopCat({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <g fill="#fff" stroke="#1d1a17" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 52 L30 26 L50 40" />
        <path d="M86 52 L90 26 L70 40" />
        <ellipse cx="60" cy="60" rx="30" ry="27" />
        <path d="M46 74 q14 12 28 0" />
        <circle cx="49" cy="57" r="2.6" fill="#1d1a17" />
        <circle cx="71" cy="57" r="2.6" fill="#1d1a17" />
      </g>
      <path d="M50 70 L60 76 L70 70" fill="#e0432f" stroke="#e0432f" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 84 q-18 0 -18 18 h36 q0 -18 -18 -18" fill="#fff" stroke="#1d1a17" strokeWidth="2.6" />
      <path d="M52 98 h16" stroke="#e0432f" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Cakeshop: cream paper with halftone dots, hand-lettered headings, a sidebar
 * that looks like a shop sign, panels in pale blue with a hard red edge, and
 * the shop cat drawn in the corner.
 */
export function Shell({ groups, me, platformName, onSearch, onSignOut, memberViewToggle, children }: ShellProps) {
  return (
    <div className="min-h-screen bg-[#fbf3e4] text-[#1d1a17] [background-image:radial-gradient(#e9d9c4_1.1px,transparent_1.1px)] [background-size:14px_14px]">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r-2 border-[#1d1a17] bg-[#fdf7ea] px-4 py-6 lg:flex">
          <Link to="/" className="mb-1 flex items-center gap-2 px-1">
            <ShopCat className="h-9 w-9" />
            <span className="font-hand text-2xl leading-tight">{platformName}</span>
          </Link>
          <p className="mb-5 px-1 font-hand text-sm text-[#a08b6f]">fresh every morning</p>
          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.label} className="pb-3">
                <p className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-[#b29a7b]">{g.label}</p>
                {g.items.map((i) => {
                  const on = location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to));
                  return (
                    <Link key={i.to} to={i.to}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-hand text-lg leading-tight ${on ? 'bg-[#f6d9d1] text-[#c03822]' : 'text-[#3a332c] hover:bg-[#f7ecd9]'}`}>
                      <i.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{i.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
            {memberViewToggle}
          </nav>
          <div className="mt-3 border-t-2 border-dashed border-[#e0cfb6] pt-3">
            <Link to="/profile" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1d1a17] bg-white font-hand text-sm">{initials(me.firstName, me.lastName)}</span>
              <span className="font-hand text-base leading-tight">{me.firstName}</span>
            </Link>
            <button type="button" onClick={onSignOut} className="mt-2 flex items-center gap-1.5 font-hand text-sm text-[#a08b6f] hover:text-[#c03822]"><LogOut className="h-3.5 w-3.5" /> sign out</button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-3 border-b-2 border-[#1d1a17] bg-[#fdf7ea] px-4 py-3 lg:hidden">
            <ShopCat className="h-7 w-7" />
            <span className="font-hand text-xl">{platformName}</span>
            <Link to="/theme" title="Themes" aria-label="Themes" className="ml-auto"><Palette className="h-4 w-4" /></Link>
            <button type="button" onClick={onSearch} className="ml-auto"><Search className="h-4 w-4" /></button>
          </header>
          <div className="px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">{children}</div>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t-2 border-[#1d1a17] bg-[#fdf7ea] py-2 lg:hidden">
        {flatNav(groups).slice(0, 4).map((i) => (
          <Link key={i.to} to={i.to} className="font-hand text-sm">{i.label}</Link>
        ))}
      </nav>
    </div>
  );
}

const PANEL = 'rounded-[18px] border-2 border-[#e0432f] bg-[#e8f1f7] p-5 shadow-[3px_3px_0_0_#1d1a17]';

export function Dash() {
  const d = useDash();
  return (
    <div className="space-y-6">
      <section className="relative flex items-end justify-between gap-4">
        <div>
          <h1 className="font-hand text-4xl leading-none sm:text-5xl">{greeting()}, {d.me.firstName}!</h1>
          <p className="mt-2 font-hand text-lg text-[#a08b6f]">Here is what is on today, freshly baked.</p>
        </div>
        <ShopCat className="hidden h-24 w-24 shrink-0 sm:block" />
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className={PANEL}>
          <p className="font-hand text-sm text-[#5d5145]">on the calendar</p>
          <p className="font-hand text-4xl leading-none text-[#c03822]">{d.upcoming?.length ?? 0}</p>
        </div>
        <div className={PANEL}>
          <p className="font-hand text-sm text-[#5d5145]">forms to fill</p>
          <p className="font-hand text-4xl leading-none text-[#c03822]">{d.pending?.length ?? 0}</p>
        </div>
        <div className={PANEL}>
          <p className="font-hand text-sm text-[#5d5145]">notices on the board</p>
          <p className="font-hand text-4xl leading-none text-[#c03822]">{d.news?.length ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-[18px] border-2 border-[#1d1a17] bg-[#fdf7ea] p-5">
          <h2 className="font-hand text-2xl">The week ahead</h2>
          {d.upcoming === null ? <p className="mt-3 font-hand text-[#a08b6f]">one moment…</p> : d.upcoming.length === 0 ? (
            <p className="mt-3 font-hand text-[#a08b6f]">nothing on the counter today.</p>
          ) : (
            <ul className="mt-2 divide-y-2 divide-dashed divide-[#e9d9c4]">
              {d.upcoming.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-2.5">
                  <span className="font-hand text-base text-[#c03822]">{dayMonth(e.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.title}</span>
                    <span className="font-hand text-xs text-[#a08b6f]">{weekday(e.date)}{e.startTime ? ` · ${clock(e.startTime)}` : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={PANEL}>
          <h2 className="font-hand text-2xl">Fresh notices</h2>
          {(d.news ?? []).slice(0, 3).map((n) => (
            <div key={n.id} className="mt-3 border-b-2 border-dashed border-[#b9cfe0] pb-2 last:border-0">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="line-clamp-2 text-xs text-[#5d5145]">{n.body}</p>
            </div>
          ))}
          {d.news !== null && d.news.length === 0 && <p className="mt-3 font-hand text-[#5d5145]">board is empty.</p>}
        </section>
      </div>
    </div>
  );
}
