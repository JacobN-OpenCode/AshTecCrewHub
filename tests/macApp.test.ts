/**
 * Ticket c80f5a65: the Mac app. The bug was that build.sh had the version
 * typed in two places, so the app announced 1.1 while the zip was 1.0. These
 * tests keep it to one place, so it cannot drift again.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

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
