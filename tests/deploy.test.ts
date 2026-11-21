/**
 * The Deploy button in Server diagnostics > Logs.
 *
 * Jacob asked to run it himself: "let me run the deploy command at the bottom of
 * the logs tab", and complained about being made to say yes three times. So
 * these tests are about the script staying fixed and single-sourced, the button
 * asking once, and the endpoint staying admin only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const deploy = readFileSync('server/deploy.ts', 'utf8');
const mcp = readFileSync('server/mcp.ts', 'utf8');
const api = readFileSync('src/api/adminDeploy.ts', 'utf8');
const dialog = readFileSync('src/components/admin/LogsDialog.tsx', 'utf8');

test('the deploy script is the same four steps, in one place', () => {
  for (const step of ['git fetch --all --prune', "['git', ['fetch', 'origin', branch]]", "['git', ['merge', '--ff-only', 'FETCH_HEAD']]", "['npm', ['run', 'schema']]", "['npm', ['run', 'build']]"]) {
    assert.ok(deploy.includes(step), `server/deploy.ts is missing ${step}`);
  }
  // order matters: schema before build, build before restart
  assert.ok(deploy.indexOf("'schema'") < deploy.indexOf("'build'"));
  assert.ok(deploy.indexOf("'build'") < deploy.indexOf('setTimeout'));
  assert.match(deploy, /systemctl restart ashtec-crew-hub/);
});

test('the deploy takes no arguments, so it cannot become a remote shell', () => {
  assert.ok(!/function runDeploy\([^)]*[a-z]/.test(deploy), 'runDeploy should take no arguments');
  assert.ok(api.includes('inputSchema: z.object({})'), 'the endpoint must not accept options');
  assert.ok(!/argv: string\[\]/.test(api), 'the endpoint must not forward commands');
});

test('one deploy at a time', () => {
  assert.match(deploy, /if \(deploying\) throw new Error\('A deploy is already running/);
  assert.match(deploy, /deploying = true;/);
  assert.match(deploy, /finally \{\s*deploying = false;/, 'the lock must clear even when a step throws');
});

test('the MCP tool and the button share the one script', () => {
  assert.ok(mcp.includes("import { runDeploy } from './deploy.js';"), 'mcp.ts should import the shared deploy');
  assert.match(mcp, /run: async \(\) => runDeploy\(\)/);
  assert.ok(!mcp.includes('child_process'), 'mcp.ts should not run commands of its own any more');
});

test('the button asks once, in plain words', () => {
  assert.equal(dialog.match(/\bask\(\{/g)?.length, 1, 'exactly one confirm dialog');
  assert.ok(!dialog.includes('window.confirm'), 'the macOS web view does not draw window.confirm');
  assert.ok(dialog.includes('title: \'Deploy now?\''));
  assert.ok(!/type\s+["']?yes/i.test(dialog), 'no typing "yes" to confirm');
  assert.ok(dialog.includes('adminDeploy({})'), 'it calls the endpoint with no options');
  assert.ok(dialog.includes("fetch('/healthz'"), 'it waits for the server to come back');
});

test('only admins can deploy', () => {
  assert.ok(api.includes('requireAdmin(context.user!.email)'));
  assert.ok(api.includes('authenticated: true'));
});
