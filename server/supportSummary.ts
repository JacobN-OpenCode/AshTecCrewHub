/**
 * Ticket f505c30e: whether new-ticket notification emails go out one at a time
 * (the long-standing behaviour) or as one daily summary.
 *
 * The choice is app-wide, not per-admin: it is a policy about how noisy the
 * maintainer inbox is, so it lives in AppSettings rather than in localStorage or
 * on a member row. Read/written with raw SQL for the same reason as the calendar
 * secret - it is a single settings row, not a modelled entity.
 */

import { zite } from './db/index.js';

export const SUPPORT_SUMMARY_KEY = 'supportSummaryMode';
/** Guards against a second digest if the server restarts inside the 08:00 hour. */
export const SUPPORT_DIGEST_SENT_KEY = 'supportDigestLastSent';

export type SupportSummaryMode = 'per-ticket' | 'daily';

/**
 * Defaults to per-ticket: existing behaviour is unchanged until an admin opts
 * into the daily summary, so deploying this is not a surprise for the team.
 */
export async function getSupportSummaryMode(): Promise<SupportSummaryMode> {
  try {
    const { rows } = await zite.sql({
      query: 'SELECT "value" FROM "AppSettings" WHERE "key" = $1',
      params: [SUPPORT_SUMMARY_KEY],
    });
    return rows[0]?.value === 'daily' ? 'daily' : 'per-ticket';
  } catch {
    return 'per-ticket';
  }
}

export async function setSupportSummaryMode(mode: SupportSummaryMode): Promise<void> {
  await zite.sql({
    query:
      'INSERT INTO "AppSettings" ("key","value") VALUES ($1,$2) ' +
      'ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"',
    params: [SUPPORT_SUMMARY_KEY, mode],
  });
}

/** The date (YYYY-MM-DD) the last digest went out, so a restart cannot resend it. */
export async function getLastDigestDate(): Promise<string> {
  try {
    const { rows } = await zite.sql({
      query: 'SELECT "value" FROM "AppSettings" WHERE "key" = $1',
      params: [SUPPORT_DIGEST_SENT_KEY],
    });
    return rows[0]?.value ?? '';
  } catch {
    return '';
  }
}

export async function setLastDigestDate(date: string): Promise<void> {
  await zite.sql({
    query:
      'INSERT INTO "AppSettings" ("key","value") VALUES ($1,$2) ' +
      'ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"',
    params: [SUPPORT_DIGEST_SENT_KEY, date],
  });
}
