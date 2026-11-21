/**
 * The MCP activity feed.
 *
 * Ticket 7a7d335c: "send a message every time the MCP does something. Not
 * simple things like listing the tools or authorising the token, but changed
 * to be made." That started as a Slack webhook; Jacob asked for a public RSS
 * feed instead, which any reader can follow with no app and no setup.
 *
 * The feed lives at an unguessable address, like the calendar feeds: the point
 * of RSS is that you paste a URL into a reader, and readers cannot send an
 * auth header. So the address is the password, and rotating it turns off
 * everyone who has the old one.
 *
 * Pure functions only, so the server and the tests can both import this.
 */

/** Tools that write. Everything else is a read, a handshake or a list. */
export const CHANGING_TOOLS = new Set([
  'deploy',
  'set_register',
  'mark_attendance',
  'control_live_show',
  'send_live_show_chat',
  'reply_to_ticket',
  'close_ticket',
  'update_ticket',
  'add_document',
  'post_announcement',
  'save_theme',
  'delete_theme',
]);

/** Tools in the order a reader sees them, for the SQL `= ANY(...)`. */
export const CHANGING_TOOL_LIST = Array.from(CHANGING_TOOLS);

/** True when this call changed something, so it belongs in the feed. */
export function isWorthTelling(tool: string): boolean {
  return CHANGING_TOOLS.has(String(tool || '').trim());
}

/** Feed keys are 20 random bytes written as hex, so 40 characters. */
export const FEED_KEY_LENGTH = 40;

export function looksLikeFeedKey(key: string): boolean {
  return new RegExp(`^[a-f0-9]{${FEED_KEY_LENGTH}}$`).test(String(key || '').trim());
}

/** Where the feed lives, given the site and the key. */
export function feedPath(key: string): string {
  return `/mcp/feed/${key}.xml`;
}

/** Enough items for a reader, few enough that the file stays small. */
export const FEED_LIMIT = 60;

/** RSS is XML, and tool output is user data, so escape everything. */
export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** One line per call: who did it, which tool, and what it replied. */
export function itemTitle(entry: { who: string; tool: string }): string {
  const who = String(entry.who || 'Someone').trim() || 'Someone';
  const tool = String(entry.tool || 'unknown').trim() || 'unknown';
  return `${who} used ${tool}`;
}

/** The body under a title: the tool's own summary, whitespace flattened. */
export function itemBody(entry: { detail?: string; ok?: boolean }): string {
  const detail = String(entry.detail || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  if (detail) return detail;
  return entry.ok === false ? 'That call failed.' : 'No details were recorded.';
}

/** RFC 822, which is what RSS pubDate wants. */
export function rssDate(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at);
  return isNaN(d.getTime()) ? new Date(0).toUTCString() : d.toUTCString();
}

export type FeedEntry = {
  who: string;
  tool: string;
  detail?: string;
  ok?: boolean;
  at: Date | string;
  id?: string;
};

/**
 * The whole document. Deliberately plain RSS 2.0 with no extensions, because
 * every reader in existence understands it and some of them choke on more.
 */
export function rssFeed(input: { title: string; siteUrl: string; selfUrl: string; entries: FeedEntry[]; now?: Date }): string {
  const entries = input.entries.slice(0, FEED_LIMIT);
  const items = entries
    .map((entry) => {
      const body = `${itemBody(entry)}\n\n${entry.ok === false ? 'Failed' : 'Done'} · ${rssDate(entry.at)}`;
      return [
        '    <item>',
        `      <title>${escapeXml(itemTitle(entry))}</title>`,
        `      <description>${escapeXml(body)}</description>`,
        `      <pubDate>${rssDate(entry.at)}</pubDate>`,
        `      <guid isPermaLink="false">${escapeXml(entry.id || `${entry.tool}-${rssDate(entry.at)}`)}</guid>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(input.title)}</title>`,
    `    <link>${escapeXml(input.siteUrl)}</link>`,
    `    <description>${escapeXml('Changes made through the MCP: registers, attendance, tickets, the live show, documents, announcements, themes and deploys. Reads and listings are left out.')}</description>`,
    `    <lastBuildDate>${rssDate(input.now ?? new Date())}</lastBuildDate>`,
    '    <language>en-gb</language>',
    `    <atom:link href="${escapeXml(input.selfUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
