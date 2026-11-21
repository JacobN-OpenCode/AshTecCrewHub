import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS, effectivePermissions, hasPermission, parsePermissionState } from '../src/lib/permissions';

test('junk in the column reads as no opinion, not a crash', () => {
  for (const raw of [null, undefined, '', 'not json', 42, [], '{}']) {
    assert.deepEqual(parsePermissionState(raw), { granted: [], revoked: [] }, `for ${JSON.stringify(raw)}`);
  }
});

test('unknown keys are dropped and repeats collapse', () => {
  const state = parsePermissionState('{"granted":["show.edit","show.edit","nonsense"],"revoked":["show.run","nonsense"]}');
  assert.deepEqual(state.granted, ['show.edit']);
  assert.deepEqual(state.revoked, ['show.run']);
});

test('an admin holds everything, whatever the record says', () => {
  const all = PERMISSIONS.map((p) => p.key);
  const held = effectivePermissions({ isAdmin: true, permissions: { revoked: all } });
  assert.equal(held.size, all.length);
});

test('members get the defaults and nothing more', () => {
  const held = effectivePermissions({});
  for (const p of PERMISSIONS) {
    assert.equal(held.has(p.key), p.fallback === 'all', `${p.key} default is wrong`);
  }
});

test('a grant adds, a revoke takes away, and a revoke wins when both are set', () => {
  assert.ok(hasPermission({ permissions: { granted: ['show.edit'] } }, 'show.edit'));
  assert.equal(hasPermission({ permissions: { revoked: ['cus.show'] } }, 'show.edit'), false);
  assert.equal(hasPermission({ permissions: { granted: ['show.edit'], revoked: ['show.edit'] } }, 'show.edit'), false);
});

test('a revoked default is really gone', () => {
  const held = effectivePermissions({ permissions: { revoked: ['members.view'] } });
  assert.equal(held.has('members.view'), false);
});
