import { Link } from 'react-router-dom';
import {
  Activity, CalendarDays, DoorOpen, LifeBuoy, Mail, Settings2, Tv, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMe } from '../../lib/me';

type Tile = {
  to: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
};

const TILES: Tile[] = [
  { to: '/admin/events', label: 'Manage events', blurb: 'Shows, rehearsals and performances', icon: Settings2 },
  { to: '/admin/members', label: 'Crew', blurb: 'Members, roles and preview mode', icon: Users },
  { to: '/admin/attendance', label: 'Venue check-in', blurb: 'Who is on site right now', icon: DoorOpen },
  { to: '/admin/emails', label: 'Emails', blurb: 'Everything the app has sent', icon: Mail },
  { to: '/admin/support', label: 'Support', blurb: 'Bug reports and feature requests', icon: LifeBuoy },
  { to: '/admin/live-show', label: 'Live show setup', blurb: 'Prepare the show dashboard', icon: Tv },
  { to: '/admin/diagnostics', label: 'Server diagnostics', blurb: 'Health, jobs and recent logs', icon: Activity },
];

/** A plain landing page for the admin group: no data of its own, just signposts. */
export default function AdminOverview() {
  const { me, supportAwaiting } = useMe();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin overview</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back, {me.firstName}. Everything you run sits here.
        </p>
      </div>

      {supportAwaiting > 0 && (
        <Link
          to="/admin/support"
          className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-3 transition-colors hover:bg-primary/[0.08]"
        >
          <LifeBuoy className="h-5 w-5 text-primary" />
          <span className="font-medium">
            {supportAwaiting} support {supportAwaiting === 1 ? 'ticket is' : 'tickets are'} waiting on you
          </span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 hc-stagger">
        {TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group hc-lift rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
          >
            <t.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 font-semibold">{t.label}</p>
            <p className="text-sm text-muted-foreground">{t.blurb}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        <CalendarDays className="h-4 w-4 text-primary" />
        Signed in as {me.firstName} {me.lastName}
      </div>
    </div>
  );
}
