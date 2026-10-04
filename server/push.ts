/**
 * Web Push (server side).
 *
 * Browsers cannot receive a notification unless a server sends it, so this is
 * the piece that was missing when the PWA first shipped the permission prompt.
 * It talks to the browser's push service (APNs for iOS, FCM for Chrome,
 * Mozilla's for Firefox) using VAPID, which is just a keypair that identifies
 * this server.
 *
 * Keys: read from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or generated once and
 * stored in AppSettings so a deploy does not need new environment variables.
 * The public key is handed to the browser to create the subscription.
 *
 * iOS: web push only works when the app is installed to the home screen (16.4+).
 * In a Safari tab there is no PushManager at all, which is why the app checks
 * for that and explains it rather than silently failing.
 */

import webpush from 'web-push';
import { db } from './db/index.js';
import { zite } from './db/index.js';

const SETTING_PUBLIC = 'vapidPublicKey';
const SETTING_PRIVATE = 'vapidPrivateKey';

let configured = false;

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');

async function getStored(key: string): Promise<string | null> {
  const { rows } = await db().query<{ value: string }>(`SELECT "value" FROM "AppSettings" WHERE "key" = $1`, [key]);
  return rows[0]?.value ?? null;
}

async function putStored(key: string, value: string): Promise<void> {
  await db().query(
    `INSERT INTO "AppSettings" ("key", "value") VALUES ($1, $2)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
    [key, value]
  );
}

/**
 * Configure web-push, generating and persisting a keypair the first time.
 * Returns the public key, or null when push is unavailable (which lets every
 * caller degrade quietly rather than throw).
 */
export async function ensureVapid(): Promise<string | null> {
  if (configured) return process.env.VAPID_PUBLIC_KEY ?? (await getStored(SETTING_PUBLIC));

  let publicKey = process.env.VAPID_PUBLIC_KEY ?? (await getStored(SETTING_PUBLIC));
  let privateKey = process.env.VAPID_PRIVATE_KEY ?? (await getStored(SETTING_PRIVATE));

  if (!publicKey || !privateKey) {
    const pair = webpush.generateVAPIDKeys();
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
    // Persisted so the subscription the browser already made stays valid across
    // restarts; regenerating would invalidate every existing subscription.
    await putStored(SETTING_PUBLIC, pair.publicKey);
    await putStored(SETTING_PRIVATE, pair.privateKey);
    console.log('[push] generated and stored a new VAPID keypair');
  }
  // Both are non-null past that block, one way or the other.
  const pub = publicKey as string;
  const priv = privateKey as string;

  try {
    webpush.setVapidDetails('mailto:opencode@navaratne.uk', pub, priv);
    configured = true;
  } catch (e) {
    console.error('[push] could not configure VAPID:', e);
    return null;
  }
  return pub;
}

export async function publicKey(): Promise<string | null> {
  return ensureVapid();
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where clicking the notification should take the member. */
  url?: string;
  /** Groups/replaces notifications of the same kind. */
  tag?: string;
}

/**
 * Send to every device a member has subscribed. Expired subscriptions (410/404)
 * are deleted, which is the only way to keep the table from filling with dead
 * devices the user has uninstalled or revoked.
 */
export async function sendToMember(memberId: string, payload: PushPayload): Promise<number> {
  if (!(await ensureVapid())) return 0;
  const { records: subs } = await zite.pushSubscriptions.findAll({ filters: { member: memberId }, limit: 50 });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, url: payload.url ?? '/' })
      );
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        // The subscription is gone for good; drop it.
        await zite.pushSubscriptions.delete({ id: s.id }).catch(() => {});
      } else {
        console.warn(`[push] send failed (${code ?? '?'}) for ${memberId}:`, e?.body ?? e?.message ?? e);
      }
    }
  }
  return sent;
}

/** Fan out to a set of members, de-duplicated. */
export async function sendToMembers(memberIds: string[], payload: PushPayload): Promise<number> {
  let n = 0;
  for (const id of [...new Set(memberIds)]) n += await sendToMember(id, payload);
  return n;
}

/**
 * True when this exact notification has not been sent before, recording it as
 * sent. Used by the scheduler so a per-minute tick does not spam.
 */
export async function claimNotification(memberId: string, kind: string, ref: string): Promise<boolean> {
  const dedupeKey = `${memberId}:${kind}:${ref}`;
  const { rows } = await db().query(
    `INSERT INTO "NotificationLog" ("id", "dedupeKey", "member", "kind")
     VALUES (gen_random_uuid(), $1, $2, $3)
     ON CONFLICT ("dedupeKey") DO NOTHING
     RETURNING "id"`,
    [dedupeKey, memberId, kind]
  );
  return rows.length > 0;
}

/** Housekeeping: drop notification-log rows older than a fortnight. */
export async function pruneNotifications(): Promise<void> {
  await db().query(`DELETE FROM "NotificationLog" WHERE "sentAt" < now() - interval '14 days'`);
}

export { appUrl };
