import { Link } from 'react-router-dom';
import { Bell, CalendarDays, ClipboardList, LogOut, MessageSquare, Search, Sparkles, Palette } from 'lucide-react';
import { flatNav, initials, type ShellProps } from './types';
import { clock, dayMonth, greeting, useDash, weekday } from '../lib/dash';

const rail =
  'group relative flex h-12 w-12 items-center justify-center rounded-2xl text-[#5b5f7b] transition-colors hover:bg-[#eef0fb] hover:text-[#4b4fa8]';
const railOn = 'bg-[#6c72d6] text-white shadow-[0_10px_22px_-10px_rgba(108,114,214,0.9)] hover:bg-[#6c72d6] hover:text-white';

/**
 * Periwinkle: a dashboard in the shape of the reference. Navigation is an icon
 * rail with no labels at all, the content sits on a lilac page in white cards,
 * and there is a real right-hand column for what needs your attention.
 */
export function Shell({ groups, me, platformName, onSearch, onSignOut, memberViewToggle, children }: ShellProps) {
  const items = flatNav(groups).slice(0, 12);
  return (
    <div className="flex min-h-screen bg-[#ebedf9] text-[#24263a]">
      <aside className="sticky top-0 hidden h-screen w-[84px] shrink-0 flex-col items-center gap-2 bg-white/70 py-5 backdrop-blur lg:flex">
        <Link to="/" title={platformName} className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#6c72d6] text-white">
          <Sparkles className="h-5 w-5" />
        </Link>
        <Link to="/theme" title="Themes" aria-label="Themes" className={rail}><Palette className="h-4 w-4" /></Link>
        <button type="button" onClick={onSearch} title="Search" className={rail}>
          <Search className="h-5 w-5" />
        </button>
        <nav className="flex flex-col items-center gap-1.5">
          {items.map((i) => {
            const on = location.pathname === i.to || (i.to !== '/' && location.pathname.startsWith(i.to));
            return (
              <Link key={i.to} to={i.to} title={i.label} className={`${rail} ${on ? railOn : ''}`}>
                <i.icon className="h-5 w-5" />
                {i.badge ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ff7a8a]" /> : null}
                <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-lg bg-[#24263a] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">{i.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <div className="w-12 overflow-hidden [&_button]:w-12 [&_button]:justify-center [&_button]:px-0 [&_span]:hidden [&_svg]:mx-auto">{memberViewToggle}</div>
          <Link to="/profile" title="My settings" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e7e9f8] text-xs font-semibold text-[#4b4fa8]">
            {initials(me.firstName, me.lastName)}
          </Link>
          <button type="button" onClick={onSignOut} title="Sign out" className={rail}><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 px-4 pt-4 lg:hidden">
          <span className="font-semibold">{platformName}</span>
          <button type="button" onClick={onSearch} className="rounded-xl bg-white p-2"><Search className="h-4 w-4" /></button>
        </header>
        <div className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</div>
      </div>
      <MobileBar groups={groups} />
    </div>
  );
}

function MobileBar({ groups }: { groups: ShellProps['groups'] }) {
  const items = flatNav(groups).slice(0, 4);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-[#dfe1f3] bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] text-[#5b5f7b]">
          <i.icon className="h-5 w-5" />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function Dash() {
  const d = useDash();
  const next = d.upcoming?.[0];
  const stats = [
    { label: 'Coming up', value: d.upcoming?.length ?? 0, icon: CalendarDays, tint: 'bg-[#e6e9fb] text-[#5b61c9]' },
    { label: 'Forms to fill', value: d.pending?.length ?? 0, icon: ClipboardList, tint: 'bg-[#fde8ef] text-[#c9557b]' },
    { label: 'Your tickets', value: d.openTickets ?? 0, icon: MessageSquare, tint: 'bg-[#e4f5ec] text-[#3f8f66]' },
    { label: 'Notices', value: d.news?.length ?? 0, icon: Bell, tint: 'bg-[#fdf1de] text-[#b07b2c]' },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_24px_60px_-40px_rgba(36,38,58,0.55)] sm:p-8">
          <h1 className="text-2xl font-semibold sm:text-3xl">{greeting()}, {d.me.firstName}!</h1>
          <p className="mt-1 text-sm text-[#6b6f8a]">What are we making today?</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { to: '/calendar', label: 'Calendar' },
              { to: '/my-events', label: 'My events' },
              { to: '/attendance', label: 'Check in' },
              { to: '/documents', label: 'Documents' },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="rounded-full bg-[#f2f3fc] px-4 py-2 text-sm font-medium text-[#4b4fa8] transition hover:-translate-y-0.5 hover:bg-[#e7e9fb]">{q.label}</Link>
            ))}
          </div>
          <img src="/cat.png" alt="" className="pointer-events-none absolute -bottom-2 right-4 hidden h-28 opacity-95 sm:block lg:h-36" />
        </section>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-3xl bg-white p-4 shadow-[0_18px_40px_-32px_rgba(36,38,58,0.6)]">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl ${s.tint}`}><s.icon className="h-5 w-5" /></div>
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="text-xs text-[#6b6f8a]">{s.label}</p>
            </div>
          ))}
        </div>

        <section className="rounded-3xl bg-white p-5 shadow-[0_18px_40px_-34px_rgba(36,38,58,0.6)]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">What is next</h2>
            <Link to="/calendar" className="text-xs font-medium text-[#5b61c9]">See all</Link>
          </div>
          {d.upcoming === null ? <div className="h-24 animate-pulse rounded-2xl bg-[#f2f3fc]" /> : d.upcoming.length === 0 ? (
            <p className="text-sm text-[#6b6f8a]">Nothing on the calendar yet.</p>
          ) : (
            <ul className="divide-y divide-[#eef0fb]">
              {d.upcoming.slice(0, 4).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#f2f3fc] text-[#4b4fa8]">
                    <span className="text-[10px] uppercase">{weekday(e.date).slice(0, 3)}</span>
                    <span className="text-xs font-semibold">{dayMonth(e.date)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-[#6b6f8a]">{e.type}{e.startTime ? ` · ${clock(e.startTime)}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-[0_18px_40px_-34px_rgba(36,38,58,0.6)]">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-[#5b61c9]" />Notifications</h2>
          {d.pending && d.pending.length > 0 && (
            <Link to="/my-events" className="mb-2 block rounded-2xl bg-[#fde8ef] p-3 text-sm">
              <span className="font-medium text-[#a8446a]">{d.pending.length} form{d.pending.length === 1 ? '' : 's'} waiting</span>
              <span className="mt-0.5 block text-xs text-[#a8446a]/80">First one is due {dayMonth(d.pending[0].dueDate)}.</span>
            </Link>
          )}
          {d.news === null ? <div className="h-16 animate-pulse rounded-2xl bg-[#f2f3fc]" /> : d.news.length === 0 ? (
            <p className="text-sm text-[#6b6f8a]">No notices right now. Quiet week.</p>
          ) : d.news.map((n) => (
            <div key={n.id} className="border-t border-[#eef0fb] py-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-[#6b6f8a]">{n.body}</p>
            </div>
          ))}
        </section>
        {next && (
          <section className="rounded-3xl bg-[#6c72d6] p-5 text-white shadow-[0_20px_44px_-26px_rgba(108,114,214,0.9)]">
            <p className="text-xs uppercase tracking-wider text-white/70">Next thing</p>
            <p className="mt-1 text-lg font-semibold">{next.title}</p>
            <p className="text-sm text-white/80">{weekday(next.date)} {dayMonth(next.date)}{next.startTime ? ` at ${clock(next.startTime)}` : ''}</p>
            <Link to="/my-events" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-[#4b4fa8]">Open my events</Link>
          </section>
        )}
      </aside>
    </div>
  );
}
