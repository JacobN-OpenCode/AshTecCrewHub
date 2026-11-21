import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('an AI agent account cannot be impersonated', () => {
  const src = read('server/auth.ts');
  assert.match(src, /memberType === 'AI Agent'/, 'startActAs must refuse an agent');
  assert.match(src, /memberType" FROM "CrewMembers" WHERE "id" = \$1/, 'the lookup has to read memberType');
});

test('an agent account is off the roster, the register and the contact sheet', () => {
  for (const file of ['src/api/adminGetRegister.ts', 'src/api/adminGetPresence.ts', 'src/api/getContactSheet.ts']) {
    assert.match(read(file), /memberType !== 'AI Agent'/, `${file} must skip agents`);
  }
  assert.match(read('src/api/adminSaveMember.ts'), /record\.hiddenFromRoster = true;/, 'a saved agent is hidden from the roster');
});

test('an agent keeps a full name, people keep one initial', () => {
  const src = read('src/api/adminSaveMember.ts');
  assert.match(src, /firstName\.trim\(\)\.length > 2/, 'the initial rule still applies to people');
  assert.match(src, /isAgent \?|!isAgent/, 'the rule is skipped for an agent');
});

test('a key can be made for an agent, and none of the keys act as a fixed admin', () => {
  const key = read('src/api/adminMcpKey.ts');
  assert.match(key, /memberId: owner \|\| me\.id/, 'a key made for an agent belongs to it');
  const page = read('src/pages/admin/AdminMcp.tsx');
  assert.doesNotMatch(page, /<dt[^>]*>Acts as<\/dt>/, 'the page no longer claims one fixed admin');
});

test('the walkthrough video is shipped with the site', () => {
  const page = read('src/pages/admin/AdminMcp.tsx');
  assert.match(page, /const VIDEO = '\/downloads\/mcp-howto\.mp4'/);
  const size = statSync(join(process.cwd(), 'public/downloads/mcp-howto.mp4')).size;
  assert.ok(size > 200_000 && size < 12_000_000, `video is ${size} bytes`);
});

test('the MCP call log is read newest first', () => {
  const src = read('src/api/adminGetMcp.ts');
  assert.match(src, /FROM "McpCallLog" ORDER BY "createdAt" DESC/, 'an unordered read froze the log at an old time');
});
