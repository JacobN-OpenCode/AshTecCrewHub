import { randomBytes } from 'crypto';
import { db } from './db/index.js';
import {
  FEED_LIMIT,
  CHANGING_TOOL_LIST,
  feedPageHtml,
  feedPath,
  looksLikeFeedKey,
  rssFeed,
  type FeedEntry,
} from '../src/lib/mcpFeed.js';

/**
 * The MCP activity feed, server side.
 *
 * Ticket 7a7d335c, second go: Jacob asked for a public RSS feed instead of a
 * Slack webhook, "thats easier to use". So the setting is one secret address
 * and the entries come straight out of the call log, which already records
 * every call. Nothing extra is written when a tool runs.
 */

const SETTING_KEY = 'mcpFeed';

function siteUrl(): string {
  return String(process.env.SITE_URL || 'https://ashtec.dino.icu').replace(/\/+$/, '');
}

/** A fresh key. Not guessable, and nothing else is derived from it. */
export function newFeedKey(): string {
  return randomBytes(20).toString('hex');
}

/** Read the saved key, or null. Never throws: a broken row means "no feed". */
export async function readFeedKey(): Promise<string | null> {
  try {
    const { rows } = await db().query('SELECT "value" FROM "Settings" WHERE "key" = $1', [SETTING_KEY]);
    const raw = rows[0]?.value as { key?: string } | undefined;
    const key = typeof raw?.key === 'string' ? raw.key.trim() : '';
    return looksLikeFeedKey(key) ? key : null;
  } catch {
    return null;
  }
}

/** The key, making one the first time anybody looks. */
export async function ensureFeedKey(): Promise<string> {
  const existing = await readFeedKey();
  if (existing) return existing;
  return rotateFeedKey();
}

/** A new address: whoever kept the old one stops getting entries. */
export async function rotateFeedKey(): Promise<string> {
  const key = newFeedKey();
  await db().query(
    'INSERT INTO "Settings" ("key", "value", "updatedAt") VALUES ($1, $2::jsonb, now()) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()',
    [SETTING_KEY, JSON.stringify({ key })],
  );
  return key;
}

/** The address a reader subscribes to. */
export function feedUrl(key: string): string {
  return `${siteUrl()}${feedPath(key)}`;
}

type Row = { id?: string; who?: string; tool?: string; detail?: string; ok?: boolean; at?: string };

/**
 * The changing calls only, newest first, joined back to the person the key
 * acts as so a title reads like a sentence rather than a key nickname.
 */
export async function loadFeedEntries(): Promise<FeedEntry[]> {
  const { rows } = await db().query(
    `SELECT l."id" AS "id",
            COALESCE(NULLIF(TRIM(COALESCE(m."firstName", '') || ' ' || COALESCE(m."lastName", '')), ''), l."keyName") AS "who",
            l."tool" AS "tool",
            l."detail" AS "detail",
            l."ok" AS "ok",
            l."createdAt" AS "at"
       FROM "McpCallLog" l
       LEFT JOIN "McpKeys" k ON k."name" = l."keyName"
       LEFT JOIN "CrewMembers" m ON m."id" = COALESCE(k."actAsMemberId", k."memberId")
      WHERE l."tool" = ANY($1)
      ORDER BY l."createdAt" DESC
      LIMIT $2`,
    [CHANGING_TOOL_LIST, FEED_LIMIT],
  );

  return (rows as Row[]).map((row) => ({
    id: String(row.id ?? ''),
    who: String(row.who ?? 'Someone'),
    tool: String(row.tool ?? 'unknown'),
    detail: String(row.detail ?? ''),
    ok: row.ok !== false,
    at: row.at ? new Date(row.at) : new Date(),
  }));
}

/** The XML a reader subscribes to. */
export async function buildMcpFeed(key: string): Promise<string> {
  return rssFeed({
    title: 'AshTec Crew Hub · MCP changes',
    siteUrl: siteUrl(),
    selfUrl: feedUrl(key),
    entries: await loadFeedEntries(),
  });
}

/**
 * The same feed as a page, for the browser somebody pastes the address into
 * (ticket 21b92db3: raw XML "looks horrible").
 */
export async function buildMcpFeedPage(key: string): Promise<string> {
  return feedPageHtml({
    siteUrl: siteUrl(),
    xmlUrl: feedUrl(key),
    entries: await loadFeedEntries(),
  });
}
