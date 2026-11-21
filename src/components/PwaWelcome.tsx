import { useEffect, useState } from 'react';
import { Button } from '@project/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@project/components/ui/dialog';
import { Bell, CalendarDays, Check, DoorOpen, Smartphone, WifiOff } from 'lucide-react';

const SEEN = 'ashtec-pwa-welcome';
const EVENT = 'ashtec-pwa-welcome-changed';

/** True when the app is running installed (home screen), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes its own flag rather than the display-mode media query.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True when the first-run welcome is on screen, so the tour can hold off. */
export const pwaWelcomeOpen = () => !isStandalone() ? false : !hasSeenWelcome();

/**
 * Re-open the welcome on demand (Settings -> PWA). Works even after it has been
 * dismissed, which is the point: it is the place to check and change the
 * notification setting later.
 */
export function openPwaWelcome(): void {
  try { localStorage.removeItem(SEEN); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Subscribe to welcome open/close, so the tour knows when to stay quiet. */
export const onPwaWelcomeChange = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

/** Whether the signed-in user is running the installed app (vs a browser tab). */
export function hasSeenWelcome(): boolean {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return false; }
}

/** Current notification permission, or 'unsupported'. */
export function notificationState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as 'granted' | 'denied' | 'default';
}

/**
 * First-run greeting for the installed PWA.
 *
 * Only appears when the app is opened from the home screen (standalone), and
 * only once per device unless re-opened from Settings. Its main job beyond the
 * welcome is to ask for notification permission from a real user gesture, which
 * browsers require - so the opt-in lives here rather than firing unprompted on
 * load.
 */
export default function PwaWelcome() {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      const standalone = isStandalone();
      setInstalled(standalone);
      setOpen(standalone && !hasSeenWelcome());
    };
    evaluate();
    const off = onPwaWelcomeChange(evaluate);
    // Permission can be changed in the browser's own UI while we are open.
    const onVisible = () => setNotif(notificationState() === 'granted' ? 'granted' : 'idle');
    document.addEventListener('visibilitychange', onVisible);
    return () => { off(); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    if (open) setNotif(notificationState() === 'granted' ? 'granted' : 'idle');
  }, [open]);

  const dismiss = () => {
    try { localStorage.setItem(SEEN, '1'); } catch {}
    setOpen(false);
    window.dispatchEvent(new Event(EVENT));
  };

  const enable = async () => {
    if (typeof Notification === 'undefined') {
      setNotif('unsupported');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotif('granted');
        // A local notification proves it works end to end; real push would need
        // a server, which this app does not run yet.
        new Notification('AshTec Crew Hub', {
          body: 'Notifications are on. We will only ping you about things that matter.',
          icon: '/icons/icon-192.png',
        });
      } else {
        setNotif('denied');
      }
    } catch {
      setNotif('denied');
    }
  };

  const features = [
    { Icon: Smartphone, title: 'Feels like a real app', body: 'Opens full screen from your home screen, with no browser bars.' },
    { Icon: CalendarDays, title: 'Your events and calendar', body: 'See what is coming up, and respond to rehearsals and club sessions.' },
    { Icon: DoorOpen, title: 'Venue check-in', body: 'Sign in and out of the room with a code an admin approves.' },
    { Icon: WifiOff, title: 'Opens without signal', body: 'The app shell is saved, so it still loads on weak school wifi.' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-2xl border border-primary/30" />
          <DialogTitle className="text-center text-2xl">Welcome to PWA mode!</DialogTitle>
          <DialogDescription className="text-center">
            {installed
              ? 'You have installed the AshTec Crew Hub. Here is what you can now do.'
              : 'Here is what the installed app can do once it is on your home screen.'}
          </DialogDescription>
        </DialogHeader>

        {!installed && (
          <p className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
            To install: open this site in Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
          </p>
        )}

        <ul className="space-y-3">
          {features.map((f) => (
            <li key={f.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <f.Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{f.title}</span>
                <span className="block text-xs text-muted-foreground">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border bg-muted/30 p-3">
          {notif === 'granted' ? (
            <p className="flex items-center gap-2 text-sm text-emerald-400">
              <Check className="h-4 w-4" /> Notifications are on.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Turn on notifications</p>
                <p className="text-xs text-muted-foreground">
                  {notif === 'denied'
                    ? 'Blocked. You can re-enable them in your browser settings, then check here again.'
                    : notif === 'unsupported'
                      ? 'This browser does not support notifications.'
                      : 'Get told when something needs you.'}
                </p>
              </div>
              <Button size="sm" onClick={enable} disabled={notif === 'unsupported'}>
                <Bell className="mr-1.5 h-4 w-4" />Enable
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
