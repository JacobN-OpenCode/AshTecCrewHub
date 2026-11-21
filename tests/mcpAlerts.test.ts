/**
 * The Slack alert rules (ticket 7a7d335c) and the Mac version file, which are
 * both easy to get subtly wrong and hard to notice.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHANGING_TOOLS, isWorthTelling, looksLikeSlackWebhook, maskWebhook, slackText } from '../src/lib/mcpAlerts';

const root = new URL('..', import.meta.url).pathname;

describe('what is worth a Slack message', () => {
  it('telling nobody about reads and handshakes', () => {
    for (const quiet of ['', 'ping', 'initialize', 'tools/list', 'crew_hub_overview', 'list_sessions', 'get_register', 'list_tickets', 'find_member', 'live_show', 'get_ticket', 'list_documents', 'search', 'schedule', 'list_themes']) {
      assert.equal(isWorthTelling(quiet), false, `${quiet || '(blank)'} should stay quiet`);
    }
  });

  it('telling the channel about anything that writes', () => {
    for (const loud of ['deploy', 'set_register', 'mark_attendance', 'reply_to_ticket', 'close_ticket', 'update_ticket', 'post_announcement', 'save_theme', 'delete_theme', 'control_live_show', 'send_live_show_chat', 'add_document']) {
      assert.equal(isWorthTelling(loud), true, `${loud} changes something and should be reported`);
    }
  });

  it('every changing tool is a real tool name', () => {
    const source = readFileSync(join(root, 'server/mcp.ts'), 'utf8');
    for (const tool of CHANGING_TOOLS) {
      assert.ok(source.includes(`name: '${tool}'`), `${tool} is in CHANGING_TOOLS but not defined in server/mcp.ts`);
    }
  });
});

describe('the webhook', () => {
  it('only accepts a real Slack incoming webhook', () => {
    assert.equal(looksLikeSlackWebhook('https://hooks.slack.com/services/T09V59WQY1E/B0BFTLXH0/abcdefghijklmnop'), true);
    assert.equal(looksLikeSlackWebhook('http://hooks.slack.com/services/T09V59WQY1E/B0BFTLXH0/abcdefghijklmnop'), false);
    assert.equal(looksLikeSlackWebhook('https://example.com/services/T09V59WQY1E/B0BFTLXH0/abcdefghijklmnop'), false);
    assert.equal(looksLikeSlackWebhook('https://hooks.slack.com/services/short'), false);
    assert.equal(looksLikeSlackWebhook(''), false);
    assert.equal(looksLikeSlackWebhook('   '), false);
  });

  it('never learns the whole address back', () => {
    const url = 'https://hooks.slack.com/services/T09V59WQY1E/B0BFTLXH0/supersecretvalue';
    const masked = maskWebhook(url);
    assert.ok(masked.startsWith('https://hooks.slack.com/services/'));
    assert.ok(masked.endsWith('tvalue'));
    assert.equal(masked.includes('supersecret'), false);
    assert.ok(masked.length < url.length);
    assert.equal(maskWebhook(''), '');
  });
});

describe('the message', () => {
  it('says who, which tool, and what changed', () => {
    const text = slackText({ who: 'Gorkie - JN Dev Agent', tool: 'mark_attendance', detail: 'Sam is here' });
    assert.ok(text.includes('*Gorkie - JN Dev Agent*'));
    assert.ok(text.includes('`mark_attendance`'));
    assert.ok(text.includes('Sam is here'));
  });

  it('keeps one line even when the tool talked a lot', () => {
    const text = slackText({ who: 'A', tool: 'deploy', detail: 'line one\n\nline two   spaced\n\n\nline three' });
    assert.equal(text.split('\n').length, 2, 'a header plus one quoted line');
    assert.ok(text.includes('line one line two spaced line three'));
  });

  it('copes with a huge result and a missing one', () => {
    const long = slackText({ who: 'A', tool: 'search', detail: 'x'.repeat(2000) });
    assert.ok(long.length < 400, 'detail is cut down');
    const bare = slackText({ who: '', tool: 'deploy', detail: '' });
    assert.ok(bare.startsWith('*Someone*'));
    assert.equal(bare.includes('\n'), false);
  });
});

describe('the Mac download cannot advertise a build that was never made', () => {
  const script = readFileSync(join(root, 'macapp/build.sh'), 'utf8');
  const latest = JSON.parse(readFileSync(join(root, 'public/downloads/latest.json'), 'utf8'));

  it('keeps the version in one place', () => {
    assert.match(script, /^version="\d+\.\d+"$/m, 'build.sh needs a version="x.y" line');
    assert.match(script, /^build="\d+"$/m, 'build.sh needs a build="n" line');
    assert.ok(script.includes('<string>${version}</string>'), 'the Info.plist must read $version');
    assert.ok(script.includes('<string>${build}</string>'), 'the Info.plist must read $build');
    assert.ok(script.includes('"version": "$version"'), 'latest.json must read $version');
  });

  it('writes no second hardcoded copy of the version', () => {
    const plistVersion = /CFBundleShortVersionString<\/key><string>([^<]*)<\/string>/.exec(script)?.[1];
    assert.equal(plistVersion, '${version}', 'a literal version in the plist can drift from latest.json');
  });

  it('latest.json is coherent and its download exists', () => {
    assert.match(latest.version, /^\d+\.\d+$/);
    assert.match(latest.url, /^\/downloads\/[A-Za-z0-9._-]+\.zip$/);
    assert.ok(latest.notes && latest.notes.length > 0);
    const file = join(root, 'public', latest.url.replace(/^\//, ''));
    assert.equal(existsSync(file), true, `${latest.url} is advertised but not in public/`);
  });

  it('the game is a version, not a date', () => {
    const [, major, minor] = /^(\d+)\.(\d+)$/.exec(latest.version) ?? [];
    assert.ok(Number(major) >= 1);
    assert.ok(Number(minor) < 100);
  });
});
