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

/* --------------------------------------------------------------------------
 * The same feed, for a person.
 *
 * Ticket 21b92db3: "Make the RSS feed look nicer, looks horrible at the
 * moment!" Fair. Raw XML in a browser is unreadable, and the address is the
 * one thing somebody will paste into a tab to check the feed works. So a
 * browser gets a page at the same address, and a reader still gets the XML,
 * because a browser is the only thing that asks for `text/html`.
 * ------------------------------------------------------------------------ */

/** The page is HTML and every field came from a tool, so escape it all. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "21 Nov, 17:38" in the school's own timezone, whatever the server thinks. */
export function londonStamp(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/London',
  }).format(d);
}

/** The stylesheet. Inline because the page has to work on its own. */
const FEED_CSS = `
  :root {
    --ink: #08070a;
    --paper: #f3ece1;
    --gold: #d9ab6c;
    --line: rgba(8, 7, 10, 0.12);
    --soft: rgba(8, 7, 10, 0.62);
    --fail: #c0331f;
    --card: #fffdf8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #f3ece1;
      --paper: #100e0c;
      --gold: #e0b97f;
      --line: rgba(243, 236, 225, 0.14);
      --soft: rgba(243, 236, 225, 0.6);
      --fail: #ff6a55;
      --card: #191613;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 16px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 44rem; margin: 0 auto; padding: 3.5rem 1.5rem 5rem; }
  .kicker {
    margin: 0 0 0.75rem;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--soft);
  }
  h1 {
    margin: 0 0 0.6rem;
    font-family: ui-serif, "Iowan Old Style", Georgia, serif;
    font-size: clamp(1.9rem, 5vw, 2.6rem);
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  .lede { margin: 0 0 1.1rem; max-width: 34rem; color: var(--soft); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding-bottom: 1.4rem; border-bottom: 2px solid var(--ink); }
  .btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
  }
  .bar span { font-size: 0.85rem; color: var(--soft); }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: 7.5rem 1fr; gap: 1rem; padding: 1.15rem 0; border-bottom: 1px solid var(--line); }
  @media (max-width: 34rem) { li { grid-template-columns: 1fr; gap: 0.35rem; } }
  .when { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; color: var(--soft); padding-top: 0.15rem; }
  .what p { margin: 0; }
  .line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
  .line strong { font-weight: 650; }
  .tool {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.75rem;
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--soft);
    background: var(--card);
  }
  .body {
    margin-top: 0.4rem !important;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.8rem;
    line-height: 1.55;
    color: var(--soft);
    word-break: break-word;
  }
  .tag { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
  li.failed .tag { color: var(--fail); }
  .empty { padding: 3rem 0; color: var(--soft); }
  footer { margin-top: 2.5rem; font-size: 0.8rem; color: var(--soft); }
  footer code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.75rem; }
`;

/**
 * The page a browser sees. Deliberately plain HTML with no script: it is
 * served from the same address as the XML, so it cannot rely on the app.
 */
export function feedPageHtml(input: {
  siteUrl: string;
  xmlUrl: string;
  entries: FeedEntry[];
  now?: Date;
}): string {
  const entries = input.entries.slice(0, FEED_LIMIT);
  const items = entries
    .map((entry) => {
      const when = londonStamp(entry.at);
      const iso = (entry.at instanceof Date ? entry.at : new Date(entry.at)).toISOString();
      // The feed always explains itself; the page stays quiet when there is
      // nothing to say, because a list of "No details were recorded." reads
      // like a broken page. Older calls predate the log keeping the reply.
      const detail = String(entry.detail || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      const failed = entry.ok === false;
      const body = detail || (failed ? 'That call failed.' : '');
      return [
        `<li class="${failed ? 'failed' : 'done'}">`,
        `  <div class="when"><time datetime="${escapeHtml(iso)}">${escapeHtml(when)}</time></div>`,
        '  <div class="what">',
        `    <p class="line"><strong>${escapeHtml(entry.who || 'Someone')}</strong><span class="tool">${escapeHtml(entry.tool || 'unknown')}</span>${failed ? '<span class="tag">failed</span>' : ''}</p>`,
        body ? `    <p class="body">${escapeHtml(body)}</p>` : '',
        '  </div>',
        '</li>',
      ]
        .filter((line) => line !== '')
        .join('\n');
    })
    .join('\n');

  const empty = '<p class="empty">Nothing has been changed through the MCP yet. The first register, ticket reply or theme will show up here.</p>';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MCP changes · AshTec Crew Hub</title>
<link rel="alternate" type="application/rss+xml" title="AshTec Crew Hub · MCP changes" href="${escapeHtml(input.xmlUrl)}">
<style>${FEED_CSS}</style>
</head>
<body>
<div class="wrap">
  <p class="kicker">AshTec Crew Hub</p>
  <h1>What the MCP changed</h1>
  <p class="lede">Every tool call that changed something. Registers, attendance, tickets, the live show, documents, announcements, themes and deploys: reads and listings are left out.</p>
  <div class="bar">
    <a class="btn" href="${escapeHtml(input.xmlUrl)}">Subscribe</a>
    <span>Paste that address into Reeder, Feedly, NetNewsWire or a Slack RSS app.</span>
  </div>
  <ol class="feed">
${items || empty}
  </ol>
  <footer>
    <p>Newest first, ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}. The address is the password: anyone with it can read this, so keep it to yourself.</p>
    <p><code>${escapeHtml(input.xmlUrl)}</code></p>
  </footer>
</div>
</body>
</html>`;
}
