import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '#auth';
import { Button } from '@project/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import {
  Activity, CalendarCheck, CalendarDays, ChevronDown, DoorOpen, Eye, HeartHandshake,
  LayoutGrid, LifeBuoy, Lightbulb, Wrench,
  Mail, LogOut, Settings2, ShieldCheck, User, Users, Tv, Sparkles,
} from 'lucide-react';
import SupportButton from './SupportButton';
import PresenceBanner from './PresenceBanner';
import { LivePresenceProvider, useLivePresence } from '../lib/livePresence';
import { usePageView } from '../hooks/usePageView';
import Tutorial from './Tutorial';
import { previewId, exitPreview } from '../lib/preview';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { PLATFORM } from '../lib/constants';

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
  // Staff get the roster read-only; only admins get the controls.
  const canRunCheckIn = me.isAdmin || me.isStaff;

  const isStaffUser = me.isStaff && me.memberType !== 'Actor';
  // Staff land on the roster, not "My Events", and the parents page is for
  // adults who run the club, so ordinary members never see it in the bar.
  const links = me.memberType === 'Actor' ? [{ to: '/', label: 'Who to Contact', icon: LayoutGrid }] : [
    { to: '/', label: isStaffUser ? 'Roster' : 'My Events', icon: isStaffUser ? Users : CalendarCheck },
    { to: '/attendance', label: 'Check-in', icon: DoorOpen, live: session !== null },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ...(me.isAdmin || isStaffUser ? [{ to: '/parents', label: 'For parents', icon: HeartHandshake }] : []),
    { to: '/tools', label: 'Tools', icon: Wrench },
    { to: '/profile', label: 'Settings', icon: User },
    { to: '/stage', label: 'Stage Layout', icon: LayoutGrid },
    // The live show dashboard appears for admins at all times and for everyone while a show is on.
    ...(me.isAdmin || liveShowActive ? [{ to: '/show-dash', label: 'Live Show', icon: Tv }] : []),
  ];

  // Every admin page lives behind one dropdown so the top bar stays short.
  // Staff who are not admins only get the check-in controls; everything deeper
  // stays admin-only.
  const adminLinks = [
    ...(canRunCheckIn ? [{ to: '/admin/attendance', label: 'Venue Check-in', icon: DoorOpen }] : []),
    { to: '/admin/events', label: 'Manage Events', icon: Settings2 },
    { to: '/admin/members', label: 'Crew', icon: Users },
    { to: '/admin/emails', label: 'Emails', icon: Mail },
    { to: '/admin/support', label: 'Support', icon: LifeBuoy, badge: supportAwaiting },
    { to: '/admin/live-show', label: 'Live Show Setup', icon: Tv },
    { to: '/admin/diagnostics', label: 'Server diagnostics', icon: Activity },
  ].filter((l) => me.isAdmin || l.to === '/admin/attendance');
  const inAdmin = loc.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen spotlight">
      {previewId() && (
        <div className="bg-primary text-primary-foreground text-sm px-4 py-2 flex items-center justify-center gap-3">
          <Eye className="h-4 w-4" />Previewing as <strong>{me.firstName} {me.lastName}</strong> (pretend account)
          <Button size="sm" variant="secondary" className="h-7" onClick={exitPreview}>Exit preview</Button>
        </div>
      )}
      <header className="app-header sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold shrink-0">
            <Lightbulb className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline">{PLATFORM}</span>
          </div>
          <nav data-tour="nav" className="flex gap-1 overflow-x-auto flex-1 min-w-0">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                data-tour={`nav-${l.to}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                    isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <l.icon className="h-4 w-4" />
                <span className="hidden md:inline">{l.label}</span>
                {'live' in l && l.live && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="check-in is open" />
                )}
              </NavLink>
            ))}
            {(me.isAdmin || me.isStaff) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-tour="admin-menu"
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                      inAdmin ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span className="hidden md:inline">{me.isAdmin ? 'Admin' : 'Staff'}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    {supportAwaiting > 0 && (
                      <span className="ml-0.5 min-w-4 h-4 px-1 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-semibold inline-flex items-center justify-center">
                        {supportAwaiting}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {adminLinks.map((l) => (
                    <DropdownMenuItem key={l.to} asChild>
                      <NavLink
                        to={l.to}
                        className={({ isActive }) =>
                          cn('flex items-center gap-2 cursor-pointer', isActive && 'text-primary font-medium')
                        }
                      >
                        <l.icon className="h-4 w-4" />
                        {l.label}
                        {'badge' in l && l.badge ? (
                          <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-semibold inline-flex items-center justify-center">
                            {l.badge}
                          </span>
                        ) : null}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
          {/* Kept as one tight group so the two icon buttons sit evenly. */}
          <div className="flex items-center gap-1 shrink-0">
            {specialNote ? (
              <span className="relative hidden sm:inline pr-0.5">
                <span title={specialNote} className="glow-pulse cursor-help text-sm font-semibold text-amber-300">
                  {me.firstName}
                </span>
                <Sparkles className="absolute -right-3.5 -top-2 h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_5px_rgba(250,204,21,0.9)]" />
              </span>
            ) : (
              <span className="text-sm text-muted-foreground hidden sm:inline pr-1">{me.firstName}</span>
            )}
            <Tutorial />
            <Button
              variant="ghost"
              size="icon"
              data-tour="signout"
              onClick={() => (previewId() ? exitPreview() : logout())}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="app-main max-w-7xl mx-auto px-4 pt-8 pb-20">
        <PresenceBanner hide={loc.pathname === '/attendance'} />
        <Outlet />
      </main>
      {!previewId() && <SupportButton />}
    </div>
  );
}
