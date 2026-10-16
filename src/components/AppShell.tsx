import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { logout } from '#auth';
import { Button } from '@project/components/ui/button';
import {
  Activity, CalendarCheck, CalendarDays, CalendarPlus, CalendarRange, ChartColumn, DoorOpen, Eye, HeartHandshake,
  LayoutGrid, LifeBuoy, Lightbulb, Mail, LogOut, Menu, MessageSquareHeart, MoreHorizontal, BookUser, Palette, PanelLeftClose,
  PanelLeftOpen, Search, Settings2, Sparkles, Trophy, Tv, Users, Wrench, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SupportButton from './SupportButton';
import PresenceBanner from './PresenceBanner';
import OfflineBanner from './OfflineBanner';
import KeyboardShortcuts, { type Shortcut } from './KeyboardShortcuts';
import CommandPalette, { type PaletteItem } from './CommandPalette';
import MemberAvatar from './MemberAvatar';
import { LivePresenceProvider, useLivePresence } from '../lib/livePresence';
import { usePageView } from '../hooks/usePageView';
import Tutorial from './Tutorial';
import { previewId, exitPreview, pv } from '../lib/preview';
import { ACCENTS, useSidebarCollapsed, useAccent, useDensity } from '../lib/uiPrefs';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { PLATFORM, MOD_KEY_LABEL, fmtDate } from '../lib/constants';
import { globalSearch, type GlobalSearchOutputType } from '#api';

/**
 * A navigation destination. Everything in the sidebar, the mobile drawer, the
 * bottom tabs and the command palette is built from these, so a page can never
 * be reachable in one place but missing from another.
 */
type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shows a green dot, e.g. check-in is open right now. */
  live?: boolean;
  /** An unread count, e.g. support tickets waiting. */
  badge?: number;
};

type NavGroup = { label: string; items: NavItem[] };

/**
 * The special-note glow. The message stays hidden until you hover over the
 * name or tap it, then a small bubble appears (and vanishes on mouse-leave,
 * outside click, or Escape).
 */
function GlowNote({ text, align = 'left', className, children }: {
  text: string;
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span
      ref={ref}
      className={cn('relative inline-block cursor-help', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((s) => !s)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute top-full z-50 mt-2 w-max max-w-xs rounded-xl border border-amber-300/40 bg-[#10131a] p-3 text-xs leading-relaxed text-amber-100 shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export default function AppShell() {
  // One poller for the whole shell: the header dot, the banner, and the
  // Check-in page itself all read the same live presence.
  return (
    <LivePresenceProvider>
      <Shell />
    </LivePresenceProvider>
  );
}

function Shell() {
  const { me, supportAwaiting, liveShowActive, specialNote } = useMe();
  const loc = useLocation();
  usePageView(loc.pathname);
  const { session } = useLivePresence();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [accent, setAccent] = useAccent();
  // Ticket 8051f385: compact density drives the single-row sidebar footer and
  // the tightened spacing (via data-density on <html>).
  const [density] = useDensity();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  // Events and crew for the search are fetched the first time it opens, not on
  // every page load, so the shell stays cheap.
  const [search, setSearch] = useState<GlobalSearchOutputType | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // Staff get the roster read-only; only admins get the controls.
  const canRunCheckIn = me.isAdmin || me.isStaff;
  const isStaffUser = me.isStaff && me.memberType !== 'Actor';
  // An Actor's access is deliberately tiny: they get their one home page and
  // nothing else. Every group below is gated on this.
  const nonActor = me.memberType !== 'Actor';

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  // Cmd/Ctrl-K opens the jump-to-page search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!palette || search) return;
    let live = true;
    setSearchLoading(true);
    globalSearch(pv())
      .then((d) => { if (live) setSearch(d); })
      .catch(() => {})
      .finally(() => { if (live) setSearchLoading(false); });
    return () => { live = false; };
  }, [palette, search]);

  const groups: NavGroup[] = [];
  const main: NavItem[] = nonActor
    ? [{ to: '/', label: isStaffUser ? 'Roster' : 'My Events', icon: isStaffUser ? Users : CalendarCheck }]
    : [{ to: '/', label: 'Who to Contact', icon: LayoutGrid }];
  if (nonActor) {
    // Ticket f455bb8c: non-staff admins asked for the roster too.
    if (me.isAdmin && !isStaffUser) main.push({ to: '/roster', label: 'Roster', icon: Users });
    main.push({ to: '/attendance', label: 'Check-in', icon: DoorOpen, live: session !== null });
    main.push({ to: '/calendar', label: 'Calendar', icon: CalendarDays });
    main.push({ to: '/schedule', label: 'Schedule', icon: CalendarRange });
    main.push({ to: '/contacts', label: 'Contacts', icon: BookUser });
    main.push({ to: '/leaderboard', label: 'Leaderboard', icon: Trophy });
  }
  groups.push({ label: 'Main', items: main });

  if (nonActor && !me.isContractor) {
    // Ticket 00c0715c: contractors never get the stage layout, and the parents
    // page is for the adults who run the club.
    const production: NavItem[] = [{ to: '/stage', label: 'Stage Layout', icon: LayoutGrid }];
    // The live show dashboard shows for admins at all times, everyone else only while a show is on.
    if (me.isAdmin || liveShowActive) production.push({ to: '/show-dash', label: 'Live Show', icon: Tv });
    groups.push({ label: 'Production', items: production });
  }

  if (nonActor) {
    const club: NavItem[] = [];
    if (me.isAdmin || me.isStaff) club.push({ to: '/parents', label: 'For parents', icon: HeartHandshake });
    club.push({ to: '/tools', label: 'Tools', icon: Wrench });
    groups.push({ label: 'Club', items: club });
  }

  // Every admin page lives in its own labelled group now, instead of behind a
  // dropdown. Staff who are not admins only get the check-in controls.
  const admin: NavItem[] = [
    { to: '/admin', label: 'Overview', icon: ChartColumn },
    ...(canRunCheckIn ? [{ to: '/admin/attendance', label: 'Venue Check-in', icon: DoorOpen }] : []),
    { to: '/admin/events', label: 'Manage Events', icon: Settings2 },
    { to: '/admin/members', label: 'Crew', icon: Users },
    { to: '/admin/emails', label: 'Emails', icon: Mail },
    { to: '/admin/support', label: 'Support', icon: LifeBuoy, badge: supportAwaiting },
    { to: '/admin/feedback', label: 'Feedback', icon: MessageSquareHeart },
    { to: '/admin/live-show', label: 'Live Show Setup', icon: Tv },
    { to: '/admin/diagnostics', label: 'Server diagnostics', icon: Activity },
  ].filter((l) => me.isAdmin || l.to === '/admin/attendance') as NavItem[];
  if (admin.length) groups.push({ label: 'Admin', items: admin });

  const cycleAccent = () => {
    const i = ACCENTS.findIndex((a) => a.id === accent);
    setAccent(ACCENTS[(i + 1) % ACCENTS.length].id);
  };

  const paletteItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [];
    // Pages, then doing-things, then the live data (events, shows, crew).
    for (const g of groups) {
      for (const i of g.items) {
        items.push({ id: `page:${i.to}`, label: i.label, group: 'Jump to', icon: i.icon, keywords: g.label, to: i.to });
      }
    }

    const actions: PaletteItem[] = [];
    if (canRunCheckIn) actions.push({ id: 'act:checkin', label: 'Open venue check-in', group: 'Actions', icon: DoorOpen, keywords: 'register attendance sign in', to: '/admin/attendance' });
    actions.push({ id: 'act:support', label: 'Submit a support request', group: 'Actions', icon: LifeBuoy, keywords: 'help bug report feedback problem helpdesk', run: () => window.dispatchEvent(new Event('ashtec:open-support')) });
    actions.push({ id: 'act:accent', label: 'Change accent colour', group: 'Actions', icon: Palette, keywords: 'theme colour color theme', run: cycleAccent });
    actions.push({ id: 'act:sidebar', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', group: 'Actions', icon: collapsed ? PanelLeftOpen : PanelLeftClose, keywords: 'menu layout nav navigation', run: () => setCollapsed(!collapsed) });
    if (nonActor) actions.push({ id: 'act:settings', label: 'Open settings', group: 'Actions', icon: Settings2, keywords: 'profile account details', to: '/profile' });
    actions.push({ id: 'act:signout', label: 'Sign out', group: 'Actions', icon: LogOut, keywords: 'log out log out', run: () => (previewId() ? exitPreview() : logout()) });
    items.push(...actions);

    if (search) {
      for (const e of search.events.slice(0, 40)) {
        items.push({
          id: `event:${e.id}`,
          label: e.title,
          group: 'Events',
          icon: CalendarDays,
          keywords: `${e.type} ${e.date ?? ''} ${e.dateTbc ? 'date tbc' : ''}`,
          hint: e.date ? fmtDate(e.date ?? null, e.dateTbc) : undefined,
          to: `/calendar?event=${encodeURIComponent(e.id)}${e.date ? `&date=${e.date}` : ''}`,
        });
      }
      for (const s of search.shows) {
        items.push({ id: `show:${s.id}`, label: s.name, group: 'Shows', icon: Tv, keywords: `${s.code ?? ''} production`, to: `/calendar?show=${encodeURIComponent(s.id)}` });
      }
      for (const m of search.members) {
        items.push({
          id: `crew:${m.id}`,
          label: `${m.firstName} ${m.lastName}`.trim(),
          group: 'Crew',
          icon: Users,
          avatarUrl: m.avatarUrl || undefined,
          keywords: `${m.username ?? ''} ${m.year ?? ''} ${m.memberType}`,
          hint: m.year ?? undefined,
          to: me.isAdmin ? `/admin/members?member=${encodeURIComponent(m.id)}` : '/',
        });
      }
    }

    return items;
  }, [groups, nonActor, canRunCheckIn, collapsed, accent, search, me.isAdmin, setCollapsed, setAccent]);

  // The title in the mobile app bar: the deepest matching destination.
  const active = groups
    .flatMap((g) => g.items)
    .filter((i) => loc.pathname === i.to || (i.to !== '/' && loc.pathname.startsWith(i.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const title = loc.pathname === '/' ? main[0].label : admin.find((i) => i.to === loc.pathname)?.label ?? active?.label ?? PLATFORM;

  const mobileTabs = main.filter((i) => ['/', '/attendance', '/calendar'].includes(i.to));

  // Batch 6: `g` then a letter jumps to a page. Built from the nav that exists
  // for this account, so a shortcut can never offer a page the member lacks.
  const shortcuts: Shortcut[] = useMemo(() => {
    const KEY_FOR: Record<string, string> = {
      '/': 'h', '/calendar': 'c', '/schedule': 's', '/attendance': 'a', '/profile': 'p', '/roster': 'r',
      '/contacts': 'n', '/leaderboard': 'l', '/tools': 't', '/stage': 'g', '/admin': 'o',
    };
    const seen = new Set<string>();
    const out: Shortcut[] = [];
    for (const g of groups) {
      for (const i of g.items) {
        const key = KEY_FOR[i.to];
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label: i.label, to: i.to });
      }
    }
    return out;
  }, [groups]);

  const account = (
    <div className="flex items-center gap-2.5">
      <MemberAvatar url={me.avatarUrl} firstName={me.firstName} lastName={me.lastName} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{me.firstName} {me.lastName}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {me.isAdmin ? 'Admin' : me.isStaff ? 'Staff' : (me.memberType || 'Crew')}
        </span>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen spotlight">
      {previewId() && (
        <div className="relative z-40 bg-primary text-primary-foreground text-sm px-4 py-2 flex items-center justify-center gap-3">
          <Eye className="h-4 w-4" />Previewing as <strong>{me.firstName} {me.lastName}</strong> (pretend account)
          <Button size="sm" variant="secondary" className="h-7" onClick={exitPreview}>Exit preview</Button>
        </div>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar: a real, labelled list instead of a scrolling tab row. */}
        <aside
          className={cn(
            'app-sidebar hidden lg:flex lg:sticky lg:top-0 lg:h-screen shrink-0 flex-col border-r bg-card/60 backdrop-blur',
            collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]',
          )}
        >
          <div className={cn('flex items-center gap-2 border-b px-3 py-3', collapsed && 'flex-col gap-1.5')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Lightbulb className="h-5 w-5" />
            </span>
            {!collapsed && <span className="min-w-0 flex-1 truncate font-bold">{PLATFORM}</span>}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPalette(true)}
            title={`Search or jump to (${MOD_KEY_LABEL}+K)`}
            className={cn(
              'mx-3 mt-3 flex items-center gap-2 rounded-xl border bg-background/50 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && <><span className="flex-1 text-left">Search or jump to</span><kbd className="rounded border px-1.5 text-[10px] font-medium">{MOD_KEY_LABEL} K</kbd></>}
          </button>

          <nav data-tour="nav" className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
            {groups.map((g) => (
              <div key={g.label}>
                {!collapsed && (
                  <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                )}
                <div className="flex flex-col gap-0.5" data-tour={g.label === 'Admin' ? 'admin-menu' : undefined}>
                  {g.items.map((i) => <NavRow key={i.to} item={i} collapsed={collapsed} />)}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t p-3">
            {collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <Tutorial />
                <Button variant="ghost" size="icon" onClick={() => (previewId() ? exitPreview() : logout())} title="Sign out" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : density === 'compact' ? (
              // Ticket 8051f385: compact puts the account, help and sign-out on
              // one row instead of stacking them.
              <div className="flex items-center gap-1">
                {nonActor ? (
                  <NavLink
                    to="/profile"
                    title="Settings"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60"
                  >
                    <MemberAvatar url={me.avatarUrl} firstName={me.firstName} lastName={me.lastName} />
                    <span className="truncate text-sm font-medium">{me.firstName} {me.lastName}</span>
                  </NavLink>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                    <MemberAvatar url={me.avatarUrl} firstName={me.firstName} lastName={me.lastName} />
                    <span className="truncate text-sm font-medium">{me.firstName} {me.lastName}</span>
                  </div>
                )}
                <Tutorial />
                <Button variant="ghost" size="icon" data-tour="signout" onClick={() => (previewId() ? exitPreview() : logout())} title="Sign out" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                {nonActor ? (
                  <NavLink to="/profile" className="block rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60">{account}</NavLink>
                ) : (
                  <div className="px-2 py-1.5">{account}</div>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <Tutorial />
                  <Button
                    variant="ghost"
                    size="sm"
                    data-tour="signout"
                    onClick={() => (previewId() ? exitPreview() : logout())}
                    className="flex-1 justify-start"
                  >
                    <LogOut className="mr-2 h-4 w-4" />Sign out
                  </Button>
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar. The sidebar is desktop-only, so this carries the brand,
              the page title, search and the profile shortcut. */}
          <header className="app-header sticky top-0 z-30 border-b bg-background/85 backdrop-blur lg:hidden">
            <div className="flex h-14 items-center gap-2 px-3">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-label="Open menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Lightbulb className="h-5 w-5 shrink-0 text-primary" />
                <span className="truncate font-semibold">{title}</span>
              </span>
              <button
                type="button"
                onClick={() => setPalette(true)}
                aria-label="Search or jump to"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <Search className="h-5 w-5" />
              </button>
              {specialNote ? (
                <GlowNote text={specialNote} align="right">
                  <span className="glow-pulse text-sm font-semibold text-amber-300">{me.firstName}</span>
                  <Sparkles className="absolute -right-3.5 -top-2 h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_5px_rgba(250,204,21,0.9)]" />
                </GlowNote>
              ) : null}
            </div>
          </header>

          <main className="app-main mx-auto max-w-7xl px-4 pt-6 lg:px-8 lg:pt-8">
            <OfflineBanner />
            <PresenceBanner hide={loc.pathname === '/attendance'} />
            {/* Keyed on the path so each page fades/slides in when you navigate.
                Query-only changes do not remount, so in-page state is kept. */}
            <div key={loc.pathname} className="animate-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs: the everyday pages. Everything else is in More. */}
      <nav
        data-tour="nav"
        className="app-tabbar fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 backdrop-blur lg:hidden"
      >
        {tabsFor(mobileTabs, () => setDrawer(true))}
      </nav>

      {/* Mobile drawer: the full grouped nav, including admin as a grid. */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col border-r bg-background shadow-2xl">
            <div className="flex items-center gap-2 border-b px-3 py-3">
              <Lightbulb className="h-5 w-5 text-primary" />
              <span className="flex-1 font-bold">{PLATFORM}</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setDrawer(false); setPalette(true); }}
              className="mx-3 mt-3 flex items-center gap-2 rounded-xl border bg-background/50 px-3 py-2 text-sm text-muted-foreground"
            >
              <Search className="h-4 w-4" />Search or jump to
            </button>
            <nav data-tour="nav" className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                <div
                  className={cn(g.label === 'Admin' ? 'grid grid-cols-2 gap-x-1 gap-y-0.5' : 'flex flex-col gap-0.5')}
                  data-tour={g.label === 'Admin' ? 'admin-menu' : undefined}
                >
                    {g.items.map((i) => <NavRow key={i.to} item={i} compact={g.label === 'Admin'} onNavigate={() => setDrawer(false)} />)}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t p-3">
              {nonActor ? (
                <NavLink to="/profile" onClick={() => setDrawer(false)} className="block rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60">{account}</NavLink>
              ) : (
                <div className="px-2 py-1.5">{account}</div>
              )}
              <div className="mt-1 flex items-center gap-1">
                <Tutorial />
                <Button variant="ghost" size="sm" onClick={() => (previewId() ? exitPreview() : logout())} className="flex-1 justify-start">
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={palette} onOpenChange={setPalette} items={paletteItems} loading={searchLoading} />
      <KeyboardShortcuts shortcuts={shortcuts} />
      {!previewId() && <SupportButton />}
    </div>
  );
}

/** Bottom tabs: the everyday pages that exist for this user, then More. */
function tabsFor(items: NavItem[], onMore: () => void) {
  return (
    <>
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === '/'}
          className={({ isActive }) => cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors',
            isActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <span className="relative">
            <i.icon className="h-5 w-5" />
            {i.live && <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="check-in is open" />}
          </span>
          {i.label}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onMore}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" />
        More
      </button>
    </>
  );
}

/** One sidebar/drawer row. Shared by desktop and mobile so they never drift. */
function NavRow({ item, collapsed, compact, onNavigate }: {
  item: NavItem;
  collapsed?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/' || item.to === '/admin'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors',
        compact ? 'px-2.5 py-2' : 'px-3 py-2',
        collapsed && 'justify-center px-0',
        isActive ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <item.icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {item.live && (
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="check-in is open" />
      )}
      {!collapsed && item.badge ? (
        <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-semibold inline-flex items-center justify-center">
          {item.badge}
        </span>
      ) : null}
      {collapsed && item.badge ? (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-400" aria-label={`${item.badge} waiting`} />
      ) : null}
    </NavLink>
  );
}
