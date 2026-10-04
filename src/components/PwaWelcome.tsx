import { useEffect, useState } from 'react';
import { Button } from '@project/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@project/components/ui/dialog';
import { Bell, CalendarDays, Check, DoorOpen, Smartphone, WifiOff } from 'lucide-react';

const SEEN = 'ashtec-pwa-welcome';

/** True when the app is running installed (home screen), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes its own flag rather than the display-mode media query.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * First-run greeting for the installed PWA.
 *
 * Only appears when the app is opened from the home screen (standalone), and
 * only once per device. Its main job beyond the welcome is to ask for
 * notification permission from a real user gesture, which browsers require - so
 * the opt-in lives here rather than firing unprompted on load.
 */
export default function PwaWelcome() {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');

  useEffect(() => {
    if (!isStandalone()) return;
    try {
      if (localStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    setOpen(true);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setNotif('granted');
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(SEEN, '1'); } catch {}
    setOpen(false);
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-2 h-14 w-14 rounded-2xl border border-primary/30" />
          <DialogTitle className="text-center text-2xl">Welcome to PWA mode!</DialogTitle>
          <DialogDescription className="text-center">
            You have installed the AshTec Crew Hub. Here is what you can now do.
          </DialogDescription>
        </DialogHeader>

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
                    ? 'Blocked. You can re-enable them in Settings, under Notifications.'
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
