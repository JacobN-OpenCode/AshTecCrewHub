import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Plus, Search, Palette } from 'lucide-react';
import { flatNav, initials, type ShellProps } from './types';
import { AdminMenu } from './AdminMenu';
import { ThemeModeToggle } from './ThemeModeToggle';
import { clock, dayMonth, greeting, useDash, weekday } from '../lib/dash';

/**
 * Intelly: a black, labelled sidebar against warm cream, pastel panels of
 * different colours, black pill buttons and a timeline down the right. High
 * contrast, no rounded-glass softness anywhere.
 */
export function Shell({ groups, me, platformName, isDarkMode, onToggleThemeMode, onSearch, onSignOut, memberViewToggle, children }: ShellProps) {
  return (
    <div className="flex min-h-screen bg-[#f6efe4] text-[#15130f]">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-[#141310] px-4 py-6 text-[#f6efe4] lg:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f7c948]" />
          <span className="font-serif text-lg">{platformName}</span>
        </Link>
        <nav className="flex-1 space-y-6 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.16em] text-[#8b8478]">{g.label}</p>
              <div className="space-y-0.5">
                {g.items.map((i) => {
                  const on = location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to));
                  return (
                    <Link key={i.to} to={i.to}
                      className={`flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors ${on ? 'bg-[#f6efe4] font-medium text-[#141310]' : 'text-[#d8d1c4] hover:bg-white/10'}`}>
                      <i.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{i.label}</span>
                      {i.badge ? <span className="ml-auto rounded-full bg-[#f7c948] px-1.5 text-[10px] font-semibold text-black">{i.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {memberViewToggle}
        </nav>
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
          <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f7c948] text-xs font-semibold text-black">{initials(me.firstName, me.lastName)}</span>
            <span className="min-w-0"><span className="block truncate text-sm">{me.firstName} {me.lastName}</span><span className="block text-[10px] text-[#8b8478]">Settings</span></span>
          </Link>
          <button type="button" onClick={onSignOut} title="Sign out" className="text-[#8b8478] hover:text-white"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b border-[#e6dccc] bg-[#f6efe4] px-4 py-3 lg:px-8">
          <span className="font-serif lg:hidden">{platformName}</span>
          <div className="ml-auto flex items-center gap-2">
            <AdminMenu groups={groups} />
            <ThemeModeToggle isDarkMode={isDarkMode} onToggle={onToggleThemeMode} className="rounded-full border border-[#e0d5c2] p-2 text-[#6f675a]" />
            <Link to="/theme" title="Themes" aria-label="Themes" className="rounded-full border border-[#e0d5c2] p-2 text-[#6f675a]"><Palette className="h-4 w-4" /></Link>
            <button type="button" onClick={onSearch} className="flex items-center gap-2 rounded-full border border-[#e0d5c2] px-3 py-1.5 text-xs text-[#6f675a]">
              <Search className="h-3.5 w-3.5" /> Search
            </button>
          </div>
        </div>
        <div className="px-4 pb-24 pt-6 lg:px-8 lg:pb-10">{children}</div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-[#e6dccc] bg-[#f6efe4]/95 py-2 backdrop-blur lg:hidden">
        {flatNav(groups).slice(0, 4).map((i) => (
          <Link key={i.to} to={i.to} className="px-3 py-1 text-[11px] text-[#6f675a]">{i.label}</Link>
        ))}
      </nav>
    </div>
  );
}

const PANEL = 'rounded-[22px] p-5';

export function Dash() {
  const d = useDash();
  const panels = [
    { label: 'Coming up', value: d.upcoming?.length ?? 0, bg: 'bg-[#fbe7a1]', to: '/calendar' },
    { label: 'Forms to fill', value: d.pending?.length ?? 0, bg: 'bg-[#f8d6df]', to: '/my-events' },
    { label: 'Your tickets', value: d.openTickets ?? 0, bg: 'bg-[#d5e8d4]', to: '/profile' },
    { label: 'Notices', value: d.news?.length ?? 0, bg: 'bg-[#ddd6f3]', to: '/announcements' },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[#9b9284]">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 font-serif text-3xl leading-tight sm:text-4xl">{greeting()}, {d.me.firstName}.</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/my-events" className="inline-flex items-center gap-2 rounded-full bg-[#141310] px-4 py-2 text-sm text-[#f6efe4]"><Plus className="h-4 w-4" /> Answer forms</Link>
            <Link to="/calendar" className="rounded-full border border-[#141310] px-4 py-2 text-sm">Calendar</Link>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4">
          {panels.map((p) => (
            <Link key={p.label} to={p.to} className={`${PANEL} ${p.bg} transition-transform hover:-translate-y-0.5`}>
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-black/60">{p.label}</p>
                <ChevronDown className="h-4 w-4 -rotate-90 text-black/50" />
              </div>
              <p className="mt-3 font-serif text-4xl leading-none">{p.value}</p>
            </Link>
          ))}
        </div>

        <section className="rounded-[22px] border border-[#e6dccc] bg-[#fffaf1] p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-xl">Coming up</h2>
            <Link to="/calendar" className="text-xs underline underline-offset-4">Full calendar</Link>
          </div>
          {d.upcoming === null ? <div className="h-20 animate-pulse rounded-xl bg-[#f0e7d7]" /> : d.upcoming.length === 0 ? (
            <p className="text-sm text-[#8b8478]">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-[#ece2d2]">
              {d.upcoming.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <span className="w-16 shrink-0 font-serif text-sm text-[#9b9284]">{dayMonth(e.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  <span className="shrink-0 text-xs text-[#9b9284]">{clock(e.startTime) || e.type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-[22px] bg-[#141310] p-5 text-[#f6efe4]">
          <h2 className="mb-4 font-serif text-lg">Today</h2>
          <ol className="relative space-y-4 border-l border-white/15 pl-4">
            {[
              ...(d.pending ?? []).slice(0, 2).map((f) => ({ title: `Form: ${f.title}`, when: `due ${dayMonth(f.dueDate)}`, dot: 'bg-[#f8d6df]' })),
              ...(d.upcoming ?? []).slice(0, 3).map((e) => ({ title: e.title, when: `${weekday(e.date)} ${clock(e.startTime)}`, dot: 'bg-[#fbe7a1]' })),
            ].slice(0, 5).map((row, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${row.dot}`} />
                <p className="text-sm leading-tight">{row.title}</p>
                <p className="text-[11px] text-[#8b8478]">{row.when}</p>
              </li>
            ))}
            {(d.pending ?? []).length + (d.upcoming ?? []).length === 0 && <li className="text-sm text-[#8b8478]">Nothing today.</li>}
          </ol>
        </section>
        {(d.news ?? []).slice(0, 2).map((n, i) => (
          <section key={n.id} className={`${PANEL} ${i === 0 ? 'bg-[#ddd6f3]' : 'bg-[#d5e8d4]'}`}>
            <p className="text-xs uppercase tracking-wide text-black/50">Notice</p>
            <p className="mt-1 text-sm font-medium leading-snug">{n.title}</p>
            <p className="mt-1 line-clamp-3 text-xs text-black/65">{n.body}</p>
          </section>
        ))}
      </aside>
    </div>
  );
}
