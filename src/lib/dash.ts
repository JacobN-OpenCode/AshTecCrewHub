import { useEffect, useState } from 'react';
import { getMyEvents, getAnnouncements, getCountdown, memberGetMyTickets } from '#api';
import { useMe } from './me';
import { pv } from './preview';
import { pendingForms } from './reminders';

export type DashEvent = {
  id: string; title: string; type: string; date: string | null; dateTbc: boolean;
  startTime: string | null; endTime: string | null; dueDate: string | null; dueUnknown: boolean;
};
export type DashForm = { kind: 'show' | 'event'; id: string; title: string; dueDate: string; maybe: boolean };
export type DashNews = { id: string; title: string; body: string; pinned: boolean; createdAt: string; authorName: string };
export type DashCountdown = { days: number; showName: string; date: string | null; title: string } | null;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The dashboard data, in one place. Each theme draws its own home page, but the
 * numbers, events and forms all come from the same endpoints so five looks can
 * never disagree about what is happening.
 */
export function useDash() {
  const api = useMe();
  const { me } = api;
  const [upcoming, setUpcoming] = useState<DashEvent[] | null>(null);
  const [pending, setPending] = useState<DashForm[] | null>(null);
  const [news, setNews] = useState<DashNews[] | null>(null);
  const [countdown, setCountdown] = useState<DashCountdown>(null);
  const [openTickets, setOpenTickets] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    getMyEvents(pv())
      .then((r) => {
        if (!live) return;
        const subs = (r.subEvents as unknown as DashEvent[]) ?? [];
        const shows = (r.shows as { id: string; name: string; dueDate: string | null; dueUnknown: boolean; hidden: boolean; response: string | null }[]) ?? [];
        setUpcoming(subs.filter((e) => !(e as { hidden?: boolean }).hidden && (!e.date || e.date >= today())).slice(0, 6));
        if (me.isStaff) {
          setPending([]);
        } else {
          setPending(pendingForms(me.id, {
            shows: shows.map((s) => ({ id: s.id, name: s.name, dueDate: s.dueDate, dueUnknown: s.dueUnknown, hidden: s.hidden })),
            subEvents: subs.map((e) => ({ id: e.id, title: e.title, showIds: [], dueDate: e.dueDate, dueUnknown: e.dueUnknown, date: e.date, dateTbc: e.dateTbc, hidden: false })),
            responses: shows.filter((s) => s.response).map((s) => ({ memberId: me.id, showId: s.id, response: s.response! })),
            attendance: subs.filter((e) => (e as { status?: string }).status).map((e) => ({ memberId: me.id, subEventId: e.id, status: (e as { status?: string }).status! })),
          }));
        }
      })
      .catch(() => { if (live) { setUpcoming([]); setPending([]); } });
    getCountdown(pv()).then((r) => { if (live && r.countdown) setCountdown(r.countdown as DashCountdown); }).catch(() => {});
    getAnnouncements({ limit: 3 }).then((r) => { if (live) setNews(r.items as unknown as DashNews[]); }).catch(() => { if (live) setNews([]); });
    memberGetMyTickets({}).then((r) => {
      if (!live) return;
      setOpenTickets((r.tickets as { status: string }[]).filter((t) => t.status === 'Open' || t.status === 'In Progress').length);
    }).catch(() => { if (live) setOpenTickets(0); });
    return () => { live = false; };
  }, [me.id, me.isStaff]);

  return { ...api, upcoming, pending, news, countdown, openTickets };
}

export const dayMonth = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBC';
export const weekday = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) : '';
export const clock = (t: string | null) => (t ? t.slice(0, 5) : '');
export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
