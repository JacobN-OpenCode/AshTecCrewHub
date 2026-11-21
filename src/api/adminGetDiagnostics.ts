import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db, zite } from '#db';
import { requireAdmin } from '../lib/server';
import { publicKey } from '../../server/push';

/**
 * Server diagnostics for the admin "Server diagnostics" tab.
 *
 * Read-only and deliberately broad: counts, schema presence, the state of the
 * background jobs, mail and push configuration, and the recent error-ish lines
 * from the running process. It exists so an admin can answer "is the server
 * healthy / did my notification job run / is mail configured" without shell
 * access. It must never expose secrets - only whether a secret is set.
 */

const count = async (table: string): Promise<number | null> => {
  try {
    const { rows } = await db().query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}"`);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
};

/** Is a column/table present? Used so a deploy that skipped the schema shows up. */
const hasTable = async (table: string): Promise<boolean> => {
  const { rows } = await db().query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return rows.length > 0;
};

export default createEndpoint({
  description: 'Returns a detailed, read-only snapshot of server health, jobs, mail and push (admins)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);

    const startedAt = process.uptime();
    const mem = process.memoryUsage();
    const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

    // Counts of everything that matters, in parallel.
    const tables = [
      'CrewMembers', 'Shows', 'SubEvents', 'ShowResponses', 'Attendance',
      'PresenceSessions', 'VenuePresence', 'VenuePresenceEvents',
      'SupportTickets', 'SupportReplies', 'EmailLog',
      'AuthMagicTokens', 'AuthSessions', 'PushSubscriptions', 'NotificationLog',
    ];
    const counts: Record<string, number | null> = {};
    for (const t of tables) counts[t] = await count(t);

    // The scheduled jobs and when they last appear to have run, inferred from
    // the most recent row each writes. There is no job-run table, so these are
    // proxies - labelled as such in the UI.
    const lastOf = async (table: string, col: string): Promise<string | null> => {
      try {
        const { rows } = await db().query<{ t: string | null }>(
          `SELECT max("${col}")::text AS t FROM "${table}"`
        );
        return rows[0]?.t ?? null;
      } catch {
        return null;
      }
    };

    const [pushSubs, notifLogNewest, emailNewest, ticketNewest, presenceEventNewest] = await Promise.all([
      zite.pushSubscriptions.findAll({ limit: 500 }).then((r) => r.records.length).catch(() => null),
      lastOf('NotificationLog', 'sentAt'),
      lastOf('EmailLog', 'createdAt'),
      lastOf('SupportTickets', 'createdAt'),
      lastOf('VenuePresenceEvents', 'createdAt'),
    ]);

    const schema = {
      missingTables: (
        await Promise.all(
          ['PushSubscriptions', 'NotificationLog', 'VenuePresenceEvents', 'AppSettings'].map(async (t) =>
            (await hasTable(t)) ? null : t
          )
        )
      ).filter(Boolean) as string[],
    };

    return {
      generatedAt: new Date().toISOString(),
      runtime: {
        uptimeSeconds: Math.round(startedAt),
        uptimeHuman: `${Math.floor(startedAt / 86400)}d ${Math.floor((startedAt % 86400) / 3600)}h ${Math.floor((startedAt % 3600) / 60)}m`,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        pid: process.pid,
        // TZ the process thinks it is in; the scheduler uses Europe/London
        // explicitly, but this is worth seeing.
        processTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
        serverTimeUTC: new Date().toISOString(),
        serverTimeLondon: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
      },
      memory: {
        rssMB: mb(mem.rss),
        heapUsedMB: mb(mem.heapUsed),
        heapTotalMB: mb(mem.heapTotal),
        externalMB: mb(mem.external),
      },
      database: {
        // Names only. No connection string, no credentials.
        host: (() => {
          try {
            const u = new URL(process.env.DATABASE_URL ?? '');
            return { host: u.hostname, port: u.port || '5432', database: u.pathname.replace(/^\//, ''), user: u.username };
          } catch {
            return { host: '(unparseable DATABASE_URL)' };
          }
        })(),
        poolMax: process.env.DATABASE_POOL_MAX ?? '(default)',
        counts,
      },
      schema,
      config: {
        appUrl: process.env.APP_URL ?? '(unset)',
        port: process.env.PORT ?? '1502',
        // Presence only, never the values.
        databaseUrlSet: Boolean(process.env.DATABASE_URL),
        smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        smtpHost: process.env.SMTP_HOST ?? '(unset)',
        smtpPort: process.env.SMTP_PORT ?? '(unset)',
        emailFrom: process.env.EMAIL_FROM ?? '(unset)',
        adminLoginSecretSet: Boolean(process.env.ADMIN_LOGIN_SECRET) || undefined,
        vapidPublicKeySet: Boolean(await publicKey()),
        nodeEnv: process.env.NODE_ENV ?? '(unset)',
      },
      jobs: {
        note: 'Inferred from the newest row each job writes; there is no run-history table.',
        lastNotificationSentAt: notifLogNewest,
        lastEmailLoggedAt: emailNewest,
        lastTicketCreatedAt: ticketNewest,
        lastPresenceEventAt: presenceEventNewest,
        pushSubscriptions: pushSubs,
        scheduled: [
          { name: 'notificationPass', when: 'hourly, on the hour (Europe/London)' },
          { name: 'formReminders', when: 'daily at 17:00 (Europe/London)' },
          { name: 'supportEscalate', when: 'hourly, on the hour (Europe/London)' },
          { name: 'pruneAuth', when: 'hourly' },
          { name: 'pruneNotifications', when: 'hourly' },
        ],
      },
    };
  },
});
