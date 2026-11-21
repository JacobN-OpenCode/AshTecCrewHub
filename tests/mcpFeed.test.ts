/**
 * Ticket 7a7d335c: the MCP activity feed. Jacob asked for a public RSS feed
 * rather than a Slack webhook: "thats easier to use".
 *
 * These check the bits worth breaking: which calls count as news, that the
 * address is unguessable, that tool output cannot break the XML, and that the
 * document a reader actually gets is valid RSS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANGING_TOOLS,
  CHANGING_TOOL_LIST,
  FEED_KEY_LENGTH,
  FEED_LIMIT,
  escapeXml,
  feedPath,
  isWorthTelling,
  itemBody,
  itemTitle,
  looksLikeFeedKey,
  rssDate,
  rssFeed,
} from '../src/lib/mcpFeed';

const mcpSource = readFileSync(new URL('../server/mcp.ts', import.meta.url), 'utf8');

test('reads and handshakes are quiet, writes are news', () => {
  for (const tool of ['', 'ping', 'initialize', 'tools/list', 'tools/call', 'crew_hub_overview', 'list_sessions', 'get_register', 'list_tickets', 'find_member', 'live_show', 'get_ticket', 'list_documents', 'search', 'schedule', 'list_themes']) {
    assert.equal(isWorthTelling(tool), false, `${tool || '(empty)'} should not be in the feed`);
  }
  for (const tool of ['deploy', 'set_register', 'mark_attendance', 'reply_to_ticket', 'close_ticket', 'update_ticket', 'post_announcement', 'save_theme', 'delete_theme', 'control_live_show', 'send_live_show_chat', 'add_document']) {
    assert.equal(isWorthTelling(tool), true, `${tool} changes something and should be in the feed`);
  }
});

test('every tool the feed filters on really exists', () => {
  for (const tool of CHANGING_TOOL_LIST) {
    assert.ok(mcpSource.includes(`name: '${tool}'`), `${tool} is in CHANGING_TOOLS but not defined in server/mcp.ts`);
  }
  assert.equal(CHANGING_TOOL_LIST.length, CHANGING_TOOLS.size);
});

test('the address is an unguessable key, and nothing else', () => {
  assert.equal(FEED_KEY_LENGTH, 40);
  assert.ok(looksLikeFeedKey('a'.repeat(40)));
  assert.ok(looksLikeFeedKey('0123456789abcdef0123456789abcdef01234567'));
  for (const bad of ['', 'abc', 'A'.repeat(40), 'z'.repeat(40), 'a'.repeat(41), 'a'.repeat(39)]) {
    assert.equal(looksLikeFeedKey(bad), false, `${bad} should not pass as a feed key`);
  }
  assert.equal(feedPath('b'.repeat(40)), `/mcp/feed/${'b'.repeat(40)}.xml`);
});

test('tool output cannot break the document', () => {
  assert.equal(escapeXml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(escapeXml(''), '');
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(`it's "quoted"`), 'it&apos;s &quot;quoted&quot;');
});

test('an item says who did what, and sorts out its own fallbacks', () => {
  assert.equal(itemTitle({ who: 'Jacob Navaratne', tool: 'save_theme' }), 'Jacob Navaratne used save_theme');
  assert.equal(itemTitle({ who: '  ', tool: '' }), 'Someone used unknown');
  assert.equal(itemBody({ detail: 'line one\n   line two' }), 'line one line two');
  assert.equal(itemBody({ detail: '' }), 'No details were recorded.');
  assert.equal(itemBody({ detail: '', ok: false }), 'That call failed.');
  assert.equal(itemBody({ detail: 'x'.repeat(900) }).length, 500);
});

test('dates are RFC 822, which is what RSS wants', () => {
  assert.equal(rssDate('2026-11-21T16:38:00Z'), 'Sat, 21 Nov 2026 16:38:00 GMT');
  assert.equal(rssDate('not a date'), new Date(0).toUTCString());
});

test('the feed is valid RSS with the entries in order', () => {
  const now = new Date('2026-11-21T17:00:00Z');
  const xml = rssFeed({
    title: 'AshTec Crew Hub · MCP changes',
    siteUrl: 'https://ashtec.dino.icu',
    selfUrl: `https://ashtec.dino.icu${feedPath('c'.repeat(40))}`,
    now,
    entries: [
      { id: 'one', who: 'Jacob Navaratne', tool: 'save_theme', detail: '{ "name": "Midnight" }', ok: true, at: '2026-11-21T16:38:00Z' },
      { id: 'two', who: 'Gorkie', tool: 'deploy', detail: '<script>alert(1)</script>', ok: false, at: '2026-11-21T16:50:00Z' },
    ],
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<atom:link href="https:\/\/ashtec\.dino\.icu\/mcp\/feed\/c{40}\.xml" rel="self"/);
  assert.match(xml, /<lastBuildDate>Sat, 21 Nov 2026 17:00:00 GMT<\/lastBuildDate>/);
  assert.equal((xml.match(/<item>/g) || []).length, 2);
  assert.ok(xml.includes('<title>Jacob Navaratne used save_theme</title>'));
  assert.ok(xml.includes('Done · Sat, 21 Nov 2026 16:38:00 GMT'));
  assert.ok(xml.includes('Failed · Sat, 21 Nov 2026 16:50:00 GMT'));
  // The script tag is escaped, not injected.
  assert.ok(!xml.includes('<script>'));
  assert.ok(xml.includes('&lt;script&gt;'));
  // Newest first is the server's job, but the order given must be kept.
  assert.ok(xml.indexOf('Jacob Navaratne') < xml.indexOf('Gorkie'));
});

test('an empty feed is still a feed', () => {
  const xml = rssFeed({ title: 'Empty', siteUrl: 'https://x.test', selfUrl: 'https://x.test/f.xml', entries: [] });
  assert.match(xml, /<\/channel>\s*<\/rss>/);
  assert.equal(xml.includes('<item>'), false);
});

test('the feed is capped, so nobody subscribes to a wall of text', () => {
  const entries = Array.from({ length: FEED_LIMIT + 20 }, (_, i) => ({
    id: `id-${i}`,
    who: 'Someone',
    tool: 'deploy',
    detail: '',
    ok: true,
    at: new Date('2026-11-21T16:00:00Z'),
  }));
  const xml = rssFeed({ title: 'T', siteUrl: 'https://x.test', selfUrl: 'https://x.test/f.xml', entries });
  assert.equal((xml.match(/<item>/g) || []).length, FEED_LIMIT);
});

test('the route refuses a wrong key instead of explaining itself', () => {
  const index = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.get\('\/mcp\/feed\/:name'/);
  assert.ok(index.includes("if (!key || given !== key) return res.status(404).type('text/plain').send('Not found');"));
  assert.ok(index.includes("res.set('Content-Type', 'application/rss+xml; charset=utf-8')"));
});

test('the feed reads the call log, so a tool call costs nothing extra', () => {
  const feed = readFileSync(new URL('../server/mcpFeed.ts', import.meta.url), 'utf8');
  assert.ok(feed.includes('FROM "McpCallLog"'));
  assert.ok(feed.includes('ORDER BY l."createdAt" DESC'));
  assert.ok(feed.includes('LIMIT $2'));
  assert.ok(feed.includes('l."tool" = ANY($1)'));
  // Nothing is posted anywhere: no fetch, no webhook.
  assert.equal(feed.includes('fetch('), false);
});
