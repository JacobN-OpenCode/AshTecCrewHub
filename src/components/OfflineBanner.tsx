import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/offlineCache';

/**
 * Batch 6: a quiet banner while the browser reports the machine is offline.
 *
 * The service worker keeps the app shell working with no connection, and the
 * read-only pages fall back to their last good data (see offlineCache). This is
 * only here so a member does not wonder why a form will not save; it says what
 * still works and gets out of the way the moment the connection returns.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You are offline. Pages you have already opened still show, but anything you change will not save until you reconnect.</span>
    </div>
  );
}
