/**
 * Web Push from the browser side: turn the browser's PushManager into a
 * subscription the server can use, and keep that in step with the member's
 * "admin notifications" choice.
 *
 * Availability is genuinely different per platform, so this reports why rather
 * than just failing:
 *   - no serviceWorker / PushManager  -> unsupported browser
 *   - iOS in a Safari tab            -> must be installed to the home screen first
 *   - Notification.permission denied -> the member said no in the browser
 */

import { getPushConfig, savePushSubscription, deletePushSubscription, setAdminNotifications, sendTestNotification } from '#api';

/** Ask the server to push a test to this member's devices and report how many. */
export async function sendTest(): Promise<{ sent: number; subscriptions: number }> {
  return sendTestNotification({});
}

/** A snapshot of everything that decides whether a push can arrive here. */
export async function diagnostics(): Promise<Record<string, string>> {
  const out: Record<string, string> = {
    pushSupported: pushSupport(),
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unavailable',
    serviceWorker: 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'registered' : 'not controlling') : 'unsupported',
    pushManager: 'PushManager' in window ? 'present' : 'absent',
    standalone: (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true) ? 'yes' : 'no',
    userAgent: navigator.userAgent.slice(0, 120),
  };
  try {
    const ep = await currentEndpoint();
    out.subscription = ep ? ep.slice(0, 60) : 'none on this device';
  } catch (e) {
    out.subscription = `error: ${(e as Error).message}`;
  }
  return out;
}

export type PushSupport = 'ready' | 'unsupported' | 'needs-install' | 'denied';

/** What to tell the member about whether push can work here. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApi) {
    // iOS Safari exposes these only once installed to the home screen.
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (ios && !standalone) return 'needs-install';
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // The SW is registered on load by main.tsx; ready waits for it.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** The endpoint of this device's subscription, or null if it has none. */
export async function currentEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await registration();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/**
 * Ask the browser for permission, create a subscription, and send it to the
 * server. Returns the endpoint so the caller can pass it back to unsubscribe.
 */
export async function enablePush(): Promise<{ ok: boolean; endpoint?: string; reason?: PushSupport | 'error' }> {
  const support = pushSupport();
  if (support !== 'ready') return { ok: false, reason: support };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const config = await getPushConfig({});
  if (!config.publicKey) return { ok: false, reason: 'error' };

  const reg = await registration();
  if (!reg) return { ok: false, reason: 'unsupported' };

  // Reuse an existing subscription if there is one, else create it.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, reason: 'error' };

  await savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent.slice(0, 300),
  });
  return { ok: true, endpoint: json.endpoint };
}

/** Drop the browser subscription and tell the server to forget it. */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  if (reg) {
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await deletePushSubscription({ endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  }
}

/** Turn admin notifications on/off, opening or closing a subscription to match. */
export async function setAdminNotificationsEnabled(enabled: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (enabled) {
    const r = await enablePush();
    if (!r.ok) return { ok: false, reason: r.reason };
  } else {
    await disablePush();
  }
  await setAdminNotifications({ enabled });
  return { ok: true };
}
