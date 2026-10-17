import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyEvents, getAnnouncements, getCountdown, memberGetMyTickets } from '#api';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import { useMe } from '../lib/me';
import { pv } from '../lib/preview';
import { pendingForms } from '../lib/reminders';
import MyBadges from '../components/MyBadges';
import {
  Award, Calendar, CalendarDays, ClipboardList, Clock, LayoutGrid, LifeBuoy, Megaphone,
  Radio, Rocket, Sparkles, Ticket, Users, Wrench,
} from 'lucide-react';

interface HomeSub {
  id: string;
  title: string;
  type: string;
  date: string | null;
  dateTbc: boolean;
  startTime: string | null;
  endTime: string | null;
  dueDate: string | null;
  dueUnknown: boolean;
  hidden: boolean;
  showIds: string[];
  status: string | null;
}
interface HomeShow {
  id: string;
  name: string;
  dueDate: string | null;
  dueUnknown: boolean;
  hidden: boolean;
  response: string | null;
}
interface Announcement { id: string; title: string; body: string; pinned: boolean; createdAt: string; authorName: string }
interface PendingForm { kind: 'show' | 'event'; id: string; title: string; dueDate: string; maybe: boolean }

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, string> = {
  'Expected Arrival': 'Attending',
  Maybe: 'Maybe',
  'Not Attending': 'Not attending',
};

const fmtDate = (iso: string | null) => {
  if (!iso) return 'Date TBC';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const relTime = (iso: string) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * The crew hub home, at `/` for everyone once signed in. It is the same route
 * for every role: the greeting, quick links and news are shared, then the page
 * fills in what matters to *this* person - a member sees what they owe and what
 * is next, staff and admins additionally get the admin shortcuts and the queue
 * of tickets waiting on them. Nothing here is a new source of truth: each card
 * reads an existing endpoint so the numbers match the dedicated pages.
 */
export default function Home() {
  const { me, specialNote, liveShowActive, supportAwaiting } = useMe();
  const [upcoming, setUpcoming] = useState<HomeSub[] | null>(null);
  const [pending, setPending] = useState<PendingForm[] | null>(null);
  const [news, setNews] = useState<Announcement[] | null>(null);
  const [countdown, setCountdown] = useState<{ days: number; showName: string; date: string | null; title: string } | null>(null);
  const [openTickets, setOpenTickets] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    getMyEvents(pv())
      .then((r) => {
        if (!live) return;
        const subs = (r.subEvents as HomeSub[]) ?? [];
        const shows = (r.shows as HomeShow[]) ?? [];
        setUpcoming(subs.filter((e) => !e.hidden && (!e.date || e.date >= today())).slice(0, 5));
        // Staff do not RSVP, so there is no "awaiting your reply" for them.
        if (!me.isStaff) {
          setPending(
            pendingForms(me.id, {
              shows: shows.map((s) => ({ id: s.id, name: s.name, dueDate: s.dueDate, dueUnknown: s.dueUnknown, hidden: s.hidden })),
              subEvents: subs.map((e) => ({ id: e.id, title: e.title, showIds: e.showIds, dueDate: e.dueDate, dueUnknown: e.dueUnknown, date: e.date, dateTbc: e.dateTbc, hidden: e.hidden })),
              responses: shows.filter((s) => s.response).map((s) => ({ memberId: me.id, showId: s.id, response: s.response! })),
              attendance: subs.filter((e) => e.status).map((e) => ({ memberId: me.id, subEventId: e.id, status: e.status! })),
            }),
          );
        } else {
          setPending([]);
        }
      })
      .catch(() => { if (live) { setUpcoming([]); setPending([]); } });
    getCountdown(pv()).then((r) => { if (live && r.countdown) setCountdown(r.countdown); }).catch(() => {});
    getAnnouncements({ limit: 3 }).then((r) => { if (live) setNews(r.items); }).catch(() => { if (live) setNews([]); });
    memberGetMyTickets({}).then((r) => {
      if (!live) return;
      const open = (r.tickets as { status: string }[]).filter((t) => t.status === 'Open' || t.status === 'In Progress').length;
      setOpenTickets(open);
    }).catch(() => { if (live) setOpenTickets(0); });
    return () => { live = false; };
  }, [me.id, me.isStaff]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const baseActions: { to: string; label: string; icon: typeof Calendar; badge?: number }[] = [
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/schedule', label: 'My schedule', icon: Clock },
    { to: '/leaderboard', label: 'Leaderboard', icon: Award },
  ];
  const actions: { to: string; label: string; icon: typeof Calendar; badge?: number }[] = [];
  if (me.isStaff || me.isAdmin) {
    actions.push({ to: '/team', label: 'The team', icon: Users });
    actions.push(...baseActions);
  } else if (me.memberType === 'Actor') {
    // Ticket 601e9c1d: actors keep their small, focused set - the stage board
    // (who to contact), their own events and the calendar - not the full crew
    // tools the sidebar deliberately withholds from them.
    actions.push({ to: '/stage', label: 'Stage & contacts', icon: LayoutGrid });
    actions.push({ to: '/my-events', label: 'My events', icon: ClipboardList });
    actions.push({ to: '/calendar', label: 'Calendar', icon: CalendarDays });
    actions.push({ to: '/announcements', label: 'Announcements', icon: Megaphone });
  } else {
    actions.push({ to: '/my-events', label: 'My events', icon: ClipboardList });
    actions.push(...baseActions);
  }
  if (me.isAdmin) {
    actions.push(
      { to: '/admin/support', label: 'Support queue', icon: LifeBuoy, badge: supportAwaiting },
      { to: '/admin', label: 'Admin', icon: LayoutGrid },
    );
  }

  const showCountdown = countdown && countdown.days <= 60;

  return (
    <div className="space-y-6 hc-stagger">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{greeting()}, {me.firstName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {me.isAdmin ? ' · Admin' : me.isStaff ? ' · Staff' : me.memberType !== 'Normal Member' ? ` · ${me.memberType}` : ''}
          </p>
        </div>
        {liveShowActive && (
          <Link to="/show-dash" className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/20">
            <Radio className="h-4 w-4 animate-pulse" />A show is live
          </Link>
        )}
      </div>

      {specialNote && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <span>{specialNote}</span>
        </div>
      )}

      {showCountdown && (
        <div className="rounded-2xl border bg-card p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{countdown!.title}</p>
            <p className="text-xl font-semibold mt-1">{countdown!.showName}</p>
            <p className="text-sm text-muted-foreground mt-1">{fmtDate(countdown!.date)}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums">{countdown!.days}</p>
            <p className="text-xs text-muted-foreground">{countdown!.days === 1 ? 'day to go' : 'days to go'}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-4 text-sm hover:bg-muted/40 hc-lift">
            <a.icon className="h-5 w-5 text-primary" />
            <span className="text-center">{a.label}</span>
            {!!a.badge && a.badge > 0 && (
              <span className="absolute top-2 right-2 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">{a.badge}</span>
            )}
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Next up</h2>
            <Link to={me.isStaff || me.isAdmin ? '/team' : '/my-events'} className="text-sm underline text-muted-foreground hover:text-foreground">See all</Link>
          </div>
          {upcoming === null ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing coming up. Enjoy the quiet.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(e.date)}{e.startTime ? ` · ${e.startTime}` : ''} · {e.type}</p>
                  </div>
                  {!me.isStaff && (
                    <Badge variant="outline" className={cn('shrink-0 text-xs',
                      e.status === 'Expected Arrival' ? 'border-green-500/40 text-green-400' :
                      e.status === 'Not Attending' ? 'border-red-500/40 text-red-400' :
                      e.status === 'Maybe' ? 'border-amber-500/40 text-amber-400' : 'text-muted-foreground')}>
                      {STATUS_LABEL[e.status ?? ''] ?? 'No reply'}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {!me.isStaff && (
          <section className="rounded-2xl border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Awaiting your reply</h2>
              <Link to="/my-events" className="text-sm underline text-muted-foreground hover:text-foreground">Respond</Link>
            </div>
            {pending === null ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">You are all caught up.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{pending.length} form{pending.length === 1 ? '' : 's'} still need your answer.</p>
                <ul className="space-y-2">
                  {pending.slice(0, 4).map((f) => (
                    <li key={`${f.kind}-${f.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                      <span className="min-w-0 truncate">{f.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">due {fmtDate(f.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Announcements</h2>
            <Link to="/announcements" className="text-sm underline text-muted-foreground hover:text-foreground">All</Link>
          </div>
          {news === null ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : news.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            <ul className="space-y-3">
              {news.map((a) => (
                <li key={a.id} className="space-y-0.5">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    {a.pinned && <span className="text-amber-400">📌</span>}{a.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
                  <p className="text-xs text-muted-foreground">{relTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" />Your support tickets</h2>
          </div>
          {openTickets === null ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : openTickets === 0 ? (
            <p className="text-sm text-muted-foreground">No open tickets. Raise one from the “?” button on any page if something breaks.</p>
          ) : (
            <p className="text-sm">You have <span className="font-semibold">{openTickets}</span> open ticket{openTickets === 1 ? '' : 's'} with the maintainers. You can see them and their replies from the help button.</p>
          )}
        </section>

        {me.isAdmin && (
          <section className="rounded-2xl border bg-card p-6 space-y-4 lg:col-span-2">
            <h2 className="font-semibold flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Admin</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Link to="/admin/support" className="rounded-xl border p-3 hover:bg-muted/40 hc-lift">
                <p className="text-sm font-medium flex items-center gap-2"><LifeBuoy className="h-4 w-4" />Support</p>
                <p className="text-xs text-muted-foreground mt-1">{supportAwaiting > 0 ? `${supportAwaiting} waiting` : 'Nothing waiting'}</p>
              </Link>
              <Link to="/admin/members" className="rounded-xl border p-3 hover:bg-muted/40 hc-lift">
                <p className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" />Members</p>
                <p className="text-xs text-muted-foreground mt-1">Roster and profiles</p>
              </Link>
              <Link to="/admin/events" className="rounded-xl border p-3 hover:bg-muted/40 hc-lift">
                <p className="text-sm font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" />Events</p>
                <p className="text-xs text-muted-foreground mt-1">Shows and rehearsals</p>
              </Link>
              <Link to="/admin/attendance" className="rounded-xl border p-3 hover:bg-muted/40 hc-lift">
                <p className="text-sm font-medium flex items-center gap-2"><ClipboardList className="h-4 w-4" />Presence</p>
                <p className="text-xs text-muted-foreground mt-1">Registers and approvals</p>
              </Link>
            </div>
          </section>
        )}
      </div>

      <MyBadges />

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Rocket className="h-3.5 w-3.5" />The crew hub is looked after by the crew. See something wrong? Use the “?” button.
      </p>
    </div>
  );
}
