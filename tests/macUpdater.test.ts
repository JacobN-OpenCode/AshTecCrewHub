/**
 * Ticket c80f5a65: "It should pull the new MacOS app, delete any old files, and
 * install the new one automatically!"
 *
 * There is no Swift toolchain on the build machine, so these tests read the app's
 * source and pin the parts that must not quietly change: the swap script waits
 * for the old process, quotes every path, strips the quarantine flag, and the
 * menu bar icon appears only when there is something to install.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const updater = readFileSync(join(root, 'macapp/Sources/AshTec/Updater.swift'), 'utf8');
const app = readFileSync(join(root, 'macapp/Sources/AshTec/App.swift'), 'utf8');
const build = readFileSync(join(root, 'macapp/build.sh'), 'utf8');
const pkg = readFileSync(join(root, 'macapp/Package.swift'), 'utf8');

describe('the Mac app installs its own updates', () => {
  it('ships the updater with no new dependency to install', () => {
    assert.equal(existsSync(join(root, 'macapp/Sources/AshTec/Updater.swift')), true);
    assert.doesNotMatch(pkg, /dependencies\s*:\s*\[/, 'no Sparkle or any other package: it builds with the Command Line Tools');
    assert.match(build, /AshTec\/?$|\*/, 'build.sh still compiles every file in Sources/AshTec');
  });

  it('swaps the bundle only after the old copy has quit', () => {
    assert.match(updater, /while \/bin\/kill -0 \\\(pid\) 2>\/dev\/null; do \/bin\/sleep 0\.3; done/,
      'nothing can overwrite a running bundle, so the script has to wait for our pid to go');
    assert.match(updater, /\/bin\/rm -rf \\\(quotedTarget\)/);
    assert.match(updater, /\/bin\/cp -R \\\(quotedNew\) \\\(quotedTarget\)/);
    assert.match(updater, /\/usr\/bin\/open \\\(quotedTarget\)/, 'and it opens the new copy, so the app comes back by itself');
  });

  it('unpacks with ditto and strips the quarantine flag', () => {
    assert.match(updater, /"\/usr\/bin\/ditto"/);
    assert.match(updater, /"-x", "-k"/);
    assert.match(updater, /xattr -dr com\.apple\.quarantine/, 'a downloaded bundle otherwise needs a Gatekeeper click after every update');
  });

  it('quotes every path it puts in that script', () => {
    assert.match(updater, /static func shellQuote/, 'paths with spaces or apostrophes must survive the trip through sh');
    assert.ok(updater.includes(`replacingOccurrences(of: "'", with: "'\\\\''")`), 'the single-quote escape is what makes shellQuote safe');
    assert.equal((updater.match(/shellQuote\(/g) ?? []).length >= 5, true);
  });

  it('compares versions as numbers, not text', () => {
    assert.match(updater, /split\(separator: "\."\)\.map \{ Int\(\$0\) \?\? 0 \}/);
    assert.match(updater, /if mine != theirs \{ return theirs > mine \}/, '1.10 is newer than 1.9, and "1.10" < "1.9" as text');
  });

  it('puts the app somewhere it is allowed to write', () => {
    assert.match(updater, /isWritableFile\(atPath: parent\)/, 'in place when the folder allows it');
    assert.match(updater, /appendingPathComponent\("Applications"\)/, 'otherwise ~/Applications, which always does');
    assert.match(updater, /There is nowhere AshTec is allowed to write/);
  });

  it('never treats a failed check as an update', () => {
    assert.match(updater, /reloadIgnoringLocalCacheData/, 'a cached latest.json would hide a release or invent one');
    assert.match(updater, /var found: Release\?/, 'nil unless the site answered and the version is newer');
    assert.match(app, /Your copy of AshTec is untouched/, 'a failed install has to say the old app is fine');
  });

  it('checks at launch and every six hours, and shows a menu bar arrow', () => {
    assert.match(app, /checkForUpdates\(quiet: true\)/);
    assert.match(app, /6 \* 60 \* 60/, 'a long-running show laptop should not wait for a relaunch to notice');
    assert.match(app, /NSStatusBar\.system\.statusItem/);
    assert.match(app, /arrow\.down\.circle\.fill/);
    assert.match(app, /removeStatusItem\(item\)/, 'the icon is a signal, so it goes away once there is nothing to install');
  });
});
