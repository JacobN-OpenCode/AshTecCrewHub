import { previewId, pv } from '../lib/preview';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { updateMyProfile, getCalendar } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { cn } from '@project/components/lib/utils';
import { Lock, CalendarPlus, ExternalLink, MessageCircle, Smartphone, Info } from 'lucide-react';
import { useMe } from '../lib/me';
import { ROLES, SELF_YEARS, WHATSAPP_COMMUNITY_URL } from '../lib/constants';
import { buildIcs, downloadIcs } from '../lib/ics';
import { useSupportCollapsed, useAccent, ACCENTS } from '../lib/uiPrefs';
import { isStandalone, openPwaWelcome, notificationState } from '../components/PwaWelcome';

export default function Profile() {
  const { me, refreshMe } = useMe();
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName);
  const [year, setYear] = useState(me.year);
  const [email, setEmail] = useState(me.email);
  const [p1, setP1] = useState(me.preferredRole1);
  const [p2, setP2] = useState(me.preferredRole2);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Editing is locked during a preview so nobody edits the wrong member.
  useEffect(() => { setPreviewing(!!previewId()); }, []);

  useEffect(() => {
    setFirstName(me.firstName); setLastName(me.lastName); setYear(me.year); setEmail(me.email);
    setP1(me.preferredRole1); setP2(me.preferredRole2);
  }, [me]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await updateMyProfile({ firstName, lastName, year, schoolEmail: email, preferredRole1: p1, preferredRole2: p2 });
      await refreshMe();
      toast.success(r.emailChanged ? 'Profile saved. Your old email still signs you in if you need it.' : 'Profile saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const Field = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{k}</p><div className="mt-1">{v || '—'}</div></div>
  );

  if (previewing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 lg:max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-6 flex gap-3">
          <Lock className="h-5 w-5 shrink-0 text-orange-400" />
          <div className="space-y-1">
            <p className="font-semibold text-orange-400">You’re previewing another account</p>
            <p className="text-sm text-muted-foreground">Editing is turned off while previewing, so you can’t accidentally change the wrong person’s details. Exit the preview to make changes.</p>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 grid sm:grid-cols-2 gap-5">
          <Field k="Name" v={`${me.firstName} ${me.lastName}`} />
          <Field k="Year" v={me.year} />
          <Field k="School email" v={me.email} />
          <Field k="Member type" v={me.memberType} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 lg:max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      {/* Two columns on desktop: the editable details on the left, the toggles
          and extras on the right, instead of one narrow strip down the middle. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 grid sm:grid-cols-2 gap-5">
            <Field k="Username" v={<span className="font-mono">{me.shortUsername}</span>} />
            <Field k="Member type" v={me.memberType} />
            <Field k="Assigned roles" v={me.roles.length ? <div className="flex flex-wrap gap-1">{me.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}</div> : null} />
            <Field k="Head of" v={me.headOf.length ? <div className="flex flex-wrap gap-1">{me.headOf.map((r) => <Badge key={r} className="bg-primary/20 text-primary border-primary/30" variant="outline">{r}</Badge>)}</div> : null} />
          </div>

          <div className="rounded-2xl border bg-card p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-lg">Your details</h2>
          <p className="text-sm text-muted-foreground">Fix a typo, or change school or move up a year. Staff status, crew roles and everything else stay admin-managed.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="fn">First name</Label>
            <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ln">Last name</Label>
            <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="yr">Year</Label>
            <Select value={year || undefined} onValueChange={setYear}>
              <SelectTrigger id="yr"><SelectValue placeholder="Choose a year" /></SelectTrigger>
              <SelectContent>
                {SELF_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                {/* An admin-set Staff year must still display, just not be selectable here. */}
                {year === 'Staff' && <SelectItem value="Staff" disabled>Staff (set by a crew admin)</SelectItem>}
              </SelectContent>
              <p className="text-xs text-muted-foreground px-1">Moving up a year is yours to change. Staff is set by a crew admin.</p>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="em">School email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="text-xs text-muted-foreground">Your old address keeps working as a backup if you change this.</p>
          </div>
        </div>

        <div className="border-t pt-5 space-y-4">
          <div>
            <h3 className="font-semibold">Preferred roles</h3>
            <p className="text-sm text-muted-foreground">Pick your top two. Admins make the final assignments.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[{ v: p1, set: setP1, l: '1st choice' }, { v: p2, set: setP2, l: '2nd choice' }].map((c) => (
              <div key={c.l} className="space-y-1">
                <Label>{c.l}</Label>
                <Select value={c.v || undefined} onValueChange={c.set}>
                  <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {p1 && p1 === p2 && <p className="text-sm text-destructive">Choose two different roles.</p>}
        </div>

        <Button data-tour="profile-save" onClick={save} disabled={busy || !p1 || !p2 || p1 === p2}>{busy ? 'Saving…' : 'Save profile'}</Button>
          </div>
        </div>

        <div className="space-y-6">
          <Preferences />

          <PwaSettings />

          <WhatsAppCommunity />

          <CalendarIntegration />
        </div>
      </div>
    </div>
  );
}

/**
 * PWA settings: whether the app is installed, the notification state, a way to
 * re-open the welcome, and install instructions when it is not installed yet.
 */
function PwaSettings() {
  const [installed] = useState(() => isStandalone());
  const [notif, setNotif] = useState(() => notificationState());

  // Re-read permission when you come back from the browser's own settings.
  useEffect(() => {
    const onVisible = () => setNotif(notificationState());
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const stateLabel: Record<string, string> = {
    granted: 'On',
    denied: 'Blocked in your browser settings',
    default: 'Not switched on yet',
    unsupported: 'Not supported on this browser',
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          App &amp; notifications
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {installed
            ? 'You are using the installed app.'
            : 'You are on the website. Install the app to get the home-screen icon and full-screen view.'}
        </p>
      </div>

      {!installed && (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
          To install: open this site in Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium">Notifications</p>
          <p className="text-xs text-muted-foreground">{stateLabel[notif]}</p>
        </div>
        <Badge variant="outline" className={notif === 'granted' ? 'border-emerald-500/40 text-emerald-400' : undefined}>
          {notif === 'granted' ? 'On' : 'Off'}
        </Badge>
      </div>

      <Button variant="outline" onClick={openPwaWelcome} className="w-full">
        <Info className="mr-2 h-4 w-4" />
        Show the PWA welcome again
      </Button>
    </div>
  );
}

/** Ticket d6b098db: a one-click way into the club's WhatsApp community. */
function WhatsAppCommunity() {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          WhatsApp community
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Crew announcements and quick questions live in the club&apos;s WhatsApp community.
        </p>
      </div>
      <Button asChild>
        <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noreferrer">
          Join the WhatsApp community
          <ExternalLink className="ml-2 h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}

/**
 * Per-device look-and-feel. Stored in this browser only, so changing it on a
 * school machine does not follow the account home. Ticket 9c895ffb.
 */
function Preferences() {
  const [collapsed, setCollapsed] = useSupportCollapsed();
  const [accent, setAccent] = useAccent();
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-lg">Preferences</h2>
        <p className="text-sm text-muted-foreground">Just for this browser. They do not follow you to another device.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Accent colour</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={accent === a.id}
              aria-label={a.label}
              title={a.label}
              onClick={() => setAccent(a.id)}
              className={cn(
                'h-9 w-9 rounded-full border-2 transition-transform',
                accent === a.id ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
              )}
              style={{ backgroundColor: `hsl(${a.hsl})` }}
            />
          ))}
        </div>
      </div>

      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span>
          <span className="block font-medium text-sm">Collapse the help button to an icon</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Shrinks the floating “Help &amp; feedback” button down to just its icon, so it stays out of the way.
          </span>
        </span>
        <Switch checked={collapsed} onCheckedChange={setCollapsed} aria-label="Collapse the help button to an icon" />
      </label>
    </div>
  );
}

/**
 * "Add to your calendar". Everyone gets it, admin included - an admin's own
 * diary should not be a worse experience than anyone else's.
 *
 * This is an .ics download rather than a subscribe link. Zite endpoints return
 * JSON, so there is nowhere to host a text/calendar feed that would keep itself
 * up to date. The file imports into Apple, Google or Outlook, but if a rehearsal
 * moves the member re-imports it. The copy says so rather than implying it syncs.
 */
function CalendarIntegration() {
  const [calBusy, setCalBusy] = useState(false);

  const download = async () => {
    setCalBusy(true);
    try {
      const d: any = await getCalendar(pv());
      const showName = (id: string) => d.shows.find((s: any) => s.id === id)?.name ?? '';
      const ics = buildIcs(d.subEvents ?? [], showName, 'AshTec Crew');
      downloadIcs('ashtec-crew.ics', ics);
      toast.success('Calendar file downloaded', {
        description: 'Open it to add these dates to Apple, Google or Outlook.',
      });
    } catch {
      toast.error('Could not build your calendar', { description: 'Try again in a moment.' });
    } finally {
      setCalBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-primary" />
          Add the crew calendar to yours
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Download your dates as a calendar file and they will sit next to your school timetable. Rehearsals and
          performances you are in are included; hidden events are not.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={download} disabled={calBusy} data-tour="profile-calendar">
          {calBusy ? 'Building…' : 'Download calendar (.ics)'}
        </Button>
        <Button variant="ghost" asChild>
          <a href="/calendar" target="_blank" rel="noreferrer">
            View the public calendar
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        This is a snapshot, not a live subscription. If a date changes you will need to download it again.
      </p>
    </div>
  );
}
