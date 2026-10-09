import { previewId, pv } from '../lib/preview';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { updateMyProfile, getCalendar, getCalendarFeed, getMyCatLoginStatus, setMyAdminSecret, memberGetMyTickets, memberEditTicket } from '#api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Switch } from '@project/components/ui/switch';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { Lock, CalendarPlus, ExternalLink, MessageCircle, Smartphone, Info, Bell, KeyRound, Cat, LifeBuoy, Pencil, Check, X, Loader2, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMe } from '../lib/me';
import { ROLES, SELF_YEARS, WHATSAPP_COMMUNITY_URL } from '../lib/constants';
import { buildIcs, downloadIcs } from '../lib/ics';
import { useSupportCollapsed, useAccent, useSupportSameTab, useCollapseTopTabs, ACCENTS } from '../lib/uiPrefs';
import { SUPPORT_MESSAGE_MAX } from '../lib/emails';
import { TYPE_STYLE, STATUS_STYLE } from '../lib/supportStyle';
import { isStandalone, openPwaWelcome, notificationState } from '../components/PwaWelcome';
import { setAdminNotificationsEnabled, sendTest, currentEndpoint, diagnostics } from '../lib/pushClient';

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
    <div className="mx-auto w-full max-w-2xl space-y-6 lg:max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      {/* Two columns on desktop: the editable details on the left, the toggles
          and extras on the right, instead of one narrow strip down the middle.
          min-w-0 on the columns is what stops a long unbroken string (an email,
          a subscription endpoint in diagnostics) forcing the whole grid wider
          than the screen on a phone. */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-6">
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
            <Label htmlFor="fn">First initial</Label>
            <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={2} />
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

          <CalendarIntegration />

          <YourTickets />
        </div>

        <div className="min-w-0 space-y-6">
          <Preferences />

          {me.isAdmin && <EmergencySignIn />}

          <PwaSettings />

          <WhatsAppCommunity />
        </div>
      </div>
    </div>
  );
}

/**
 * Admin-only emergency sign-in (cat login), ticket 8cd13381.
 *
 * Each admin manages their own passphrase from this card. The cleartext
 * never touches the database - it is hashed server-side - and no other admin
 * can see whether yours is set, what it is, or how many attempts have been
 * made against it. There are deliberately no strength requirements: the
 * opening ticket says "no password/PIN requirements" and a 4-digit PIN is
 * fine.
 */
function EmergencySignIn() {
  const [hasSecret, setHasSecret] = useState<boolean>(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyCatLoginStatus({}).then((r) => { if (alive) setHasSecret(!!r.hasSecret); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await setMyAdminSecret({ value });
      setHasSecret(!!r.hasSecret);
      setValue('');
      setRevealed(false);
      toast.success(r.hasSecret ? 'Passphrase saved' : 'Passphrase cleared');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const r = await setMyAdminSecret({ value: '' });
      setHasSecret(!!r.hasSecret);
      toast.success('Passphrase cleared');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const placeholder = useMemo(() => (hasSecret ? 'Enter a new passphrase to replace it' : 'Choose a passphrase or PIN'), [hasSecret]);

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Cat className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Emergency sign-in (cat)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        For when the magic-link email can&rsquo;t get through (school mail filter, no signal on the phone). Tap the crew cat five times on
        the sign-in screen and use this passphrase. Other admins can&rsquo;t see it, and it lives only in your account.
      </p>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Status</span>
        {hasSecret ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400"><KeyRound className="h-3 w-3 mr-1" />Set</Badge>
        ) : (
          <Badge variant="outline" className="border-amber-500/40 text-amber-400">Not set</Badge>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-secret">New passphrase</Label>
        <div className="flex gap-2">
          <Input
            id="cat-secret"
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoComplete="new-password"
            disabled={busy}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setRevealed((r) => !r)}
            disabled={!value}
          >
            {revealed ? 'Hide' : 'Show'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Leave blank and click <strong>Clear</strong> to remove the existing passphrase. There are no strength requirements: a 4-digit PIN is fine.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || !value}>
          {hasSecret ? 'Replace passphrase' : 'Save passphrase'}
        </Button>
        {hasSecret && (
          <Button variant="outline" onClick={clear} disabled={busy}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * PWA settings: whether the app is installed, the notification state, the admin
 * notifications switch, a way to re-open the welcome, and install instructions
 * when it is not installed yet.
 */
function PwaSettings() {
  const { me, refreshMe } = useMe();
  const [installed] = useState(() => isStandalone());
  const [notif, setNotif] = useState(() => notificationState());
  const [adminNotifs, setAdminNotifs] = useState<boolean>(me.adminNotifications);
  // Whether THIS device actually holds a push subscription - the thing that
  // decides if a notification can arrive, as opposed to the stored preference.
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [diag, setDiag] = useState<Record<string, string> | null>(null);

  // Look for a real browser subscription when the panel opens.
  useEffect(() => {
    let alive = true;
    currentEndpoint().then((ep) => { if (alive) setSubscribed(!!ep); });
    return () => { alive = false; };
  }, []);

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

  const canToggleAdmin = me.isAdmin || me.isMaintainer;

  const flip = async (next: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      // Turning on opens the subscription and asks the OS; turning off drops it.
      const r = await setAdminNotificationsEnabled(next);
      if (!r.ok) {
        setNote(
          r.reason === 'needs-install'
            ? 'Add the app to your home screen first, then turn this on.'
            : r.reason === 'denied'
              ? 'Your browser is blocking notifications. Allow them in browser settings, then try again.'
              : 'This browser cannot do notifications.',
        );
        // Permission not granted means no subscription, so reflect that.
        if (next) setAdminNotifs(false);
        return;
      }
      setAdminNotifs(next);
      setNotif(notificationState());
      setSubscribed(!!(await currentEndpoint()));
      await refreshMe();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
            : 'You are on the website. Install the app to get the home-screen icon, full-screen view and notifications.'}
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

      {/* Only admins and maintainers have operational notifications to receive. */}
      {canToggleAdmin && (
        <label className="flex items-start justify-between gap-4 border-t pt-4 cursor-pointer">
          <span>
            <span className="block font-medium text-sm">Admin notifications</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {me.isMaintainer
                ? 'New bug reports and feature requests, replies, and people waiting at venue check-in.'
                : 'New support tickets, replies, and people waiting for you to approve a venue check-in.'}
            </span>
            {/* Distinguish the preference from whether THIS device can receive. */}
            <span className="block text-xs text-muted-foreground mt-1">
              {subscribed
                ? 'This device is set up to receive them.'
                : 'This device is not subscribed yet — switch this on to allow notifications here.'}
            </span>
          </span>
          <Switch
            checked={subscribed}
            disabled={busy}
            onCheckedChange={flip}
            aria-label="Admin notifications"
          />
        </label>
      )}

      {!canToggleAdmin && (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          You will get notifications about your own commitments — forms due, response deadlines, and checking in to the
          venue.
        </p>
      )}

      {note && <p className="text-xs text-amber-400">{note}</p>}

      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
        <Button
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              const r = await sendTest();
              setNote(
                r.sent > 0
                  ? `Sent to ${r.sent} of your ${r.subscriptions} device${r.subscriptions === 1 ? '' : 's'}. Check your notifications.`
                  : r.subscriptions === 0
                    ? 'No device is subscribed yet. Turn on admin notifications above (or the switch), and allow the permission prompt.'
                    : `Could not deliver to ${r.subscriptions} device${r.subscriptions === 1 ? '' : 's'}. They may have been uninstalled; toggle notifications off and on again.`,
              );
            } catch (e) {
              setNote((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Bell className="mr-2 h-4 w-4" />
          Send test notification
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={async () => setDiag(await diagnostics())}
        >
          <Info className="mr-2 h-4 w-4" />
          Why no notifications?
        </Button>
      </div>

      {diag && (
        <pre className="w-full overflow-x-auto rounded-xl border bg-muted/30 p-3 text-[11px] leading-relaxed">
          {Object.entries(diag).map(([k, v]) => `${k}: ${v}`).join('\n')}
        </pre>
      )}

      <Button variant="ghost" size="sm" className="w-full" onClick={openPwaWelcome}>
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
  const [sameTab, setSameTab] = useSupportSameTab();
  const [collapseTabs, setCollapseTabs] = useCollapseTopTabs();
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

      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span>
          <span className="block font-medium text-sm">Open support tickets in the same tab</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            The support list opens a ticket in a new tab by default. Turn this on to open it here instead.
          </span>
        </span>
        <Switch checked={sameTab} onCheckedChange={setSameTab} aria-label="Open support tickets in the same tab" />
      </label>

      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span>
          <span className="block font-medium text-sm">Collapse the top tabs into icons</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            Hides the labels on the top navigation so the bar is just icons, giving you more room. Hover a tab to see its name.
          </span>
        </span>
        <Switch checked={collapseTabs} onCheckedChange={setCollapseTabs} aria-label="Collapse the top tabs into icons" />
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
  const [feed, setFeed] = useState<{ url: string; webcal: string } | null>(null);

  // Ticket ab308aca: the live subscribe feed.
  useEffect(() => {
    getCalendarFeed({})
      .then((f) => setFeed(f as { url: string; webcal: string }))
      .catch(() => {});
  }, []);

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

  const copy = async () => {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      toast.success('Subscribe link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
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
          Rehearsals and performances you are in, next to your school timetable. Hidden events are not included.
        </p>
      </div>

      <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3 space-y-2">
        <p className="text-sm font-medium">Subscribe (updates automatically)</p>
        <p className="text-xs text-muted-foreground">
          Add this once in Apple, Google or Outlook Calendar and it keeps itself in sync — no re-importing when a
          rehearsal moves.
        </p>
        <div className="flex flex-wrap gap-2">
          {feed ? (
            <Button size="sm" asChild>
              <a href={feed.webcal}>Subscribe in your calendar app</a>
            </Button>
          ) : (
            <Button size="sm" disabled>Loading…</Button>
          )}
          <Button size="sm" variant="outline" onClick={copy} disabled={!feed}>Copy link</Button>
        </div>
        {feed && <p className="break-all font-mono text-[11px] text-muted-foreground">{feed.url}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={download} disabled={calBusy} data-tour="profile-calendar">
          {calBusy ? 'Building…' : 'Download once (.ics)'}
        </Button>
        <Button variant="ghost" asChild>
          <a href="/calendar" target="_blank" rel="noreferrer">
            View the public calendar
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The download is a one-off snapshot — if a date changes you would download it again. The subscribe link above
        does not have that problem.
      </p>
    </div>
  );
}

/**
 * The sender's view of their own support tickets (5b5f0c2a). Shows what is
 * still editable - an Open or In Progress ticket can be corrected or fleshed
 * out - and lets the member do it in place. Editing tells the maintainers so a
 * change never quietly rewrites what they were already answering.
 */
function YourTickets() {
  const [tickets, setTickets] = useState<Awaited<ReturnType<typeof memberGetMyTickets>>['tickets'] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState<'recency' | 'category'>('recency');
  const { me } = useMe();
  const [sameTab] = useSupportSameTab();
  const load = () => memberGetMyTickets({}).then((r) => setTickets(r.tickets)).catch(() => setTickets([]));
  useEffect(() => { load(); }, []);

  // Ticket c94884d3: the card has its own sort. "Newest first" mirrors the
  // server order; "By category" groups the types together, newest first inside
  // each group. Sorts in place, so editing still works exactly as before.
  // Must run on every render (not below the early return) so the hook count
  // never changes once the ticket list arrives -- an early-returned loader
  // skips useMemo and the next render explodes with "more hooks than before".
  const TYPE_ORDER = ['Bug Report', 'Feature Request', 'General Support'];
  const shown = useMemo(() => {
    if (!tickets || sort === 'recency') return tickets ?? [];
    return [...tickets].sort((a, b) => {
      const aa = TYPE_ORDER.indexOf(a.type);
      const bb = TYPE_ORDER.indexOf(b.type);
      return (aa === -1 ? TYPE_ORDER.length : aa) - (bb === -1 ? TYPE_ORDER.length : bb) ||
        b.submittedAt.localeCompare(a.submittedAt);
    });
  }, [tickets, sort]);

  if (tickets === null) return <div className="rounded-2xl border bg-card p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const startEdit = (t: typeof tickets[number]) => { setEditing(t.id); setSubject(t.subject); setMessage(t.message); };
  const save = async (t: typeof tickets[number]) => {
    setSaving(true);
    try {
      await memberEditTicket({ id: t.id, subject, message });
      toast.success('Ticket updated', { description: 'The crew has been told about the change.' });
      setEditing(null);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Your support tickets
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you have raised. Tickets that are still open can be edited — fix a typo or add detail, and the
            crew is told automatically.
          </p>
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as 'recency' | 'category')}>
          <SelectTrigger className="w-[150px]" aria-label="Sort tickets">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recency">Newest first</SelectItem>
            <SelectItem value="category">By category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 && <p className="text-sm text-muted-foreground">You have not raised any tickets yet.</p>}

      <ul className="space-y-3">
        {shown.map((t) => (
          <li key={t.id} className="rounded-xl border p-4 space-y-3">
            {editing === t.id ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="t-subject">Subject</Label>
                  <Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="t-message">What you want the crew to know</Label>
                  <Textarea id="t-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={SUPPORT_MESSAGE_MAX} rows={4} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving || !subject.trim() || !message.trim()} onClick={() => save(t)}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}Save changes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                    <X className="h-4 w-4 mr-1.5" />Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Ticket 1e19f93d: an admin can open any of their tickets
                      straight from here, honouring the same-tab preference. */}
                  {me.isAdmin ? (
                    <Link
                      to={`/admin/support/${t.id}`}
                      target={sameTab ? undefined : '_blank'}
                      rel={sameTab ? undefined : 'noopener noreferrer'}
                      title="Open in the support page"
                      className="font-medium min-w-0 truncate flex-1 hover:underline inline-flex items-center gap-1.5"
                    >
                      {t.subject}
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  ) : (
                    <p className="font-medium min-w-0 truncate flex-1">{t.subject}</p>
                  )}
                  {t.editable && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className={TYPE_STYLE[t.type]}>{t.type}</Badge>
                  <Badge variant="outline" className={STATUS_STYLE[t.status]}>{t.status}</Badge>
                  {t.submittedAt && <span>· {new Date(t.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  <span>· {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}</span>
                </div>
                {!t.editable && <p className="text-xs text-muted-foreground">Finished, so it is locked.</p>}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
