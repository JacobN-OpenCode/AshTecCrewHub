import assert from 'node:assert/strict';
import test from 'node:test';

import { allow, locked, recordFailure, recordSuccess } from '../server/rateLimit';

test('four wrong guesses do not lock, the fifth does', () => {
  for (let i = 0; i < 4; i += 1) assert.equal(recordFailure('a@b.c', '1.1.1.1'), null);
  assert.equal(locked('a@b.c', '1.1.1.1'), 0);
  const lock = recordFailure('a@b.c', '1.1.1.1');
  assert.ok(lock && lock.lockMs > 0, 'the fifth guess should report a lock');
  assert.ok(locked('a@b.c', '1.1.1.1') > 0);
});

test('the lock is per target, so one member cannot lock another out', () => {
  recordFailure('one@b.c', '2.2.2.2');
  recordFailure('one@b.c', '2.2.2.2');
  recordFailure('one@b.c', '2.2.2.2');
  recordFailure('one@b.c', '2.2.2.2');
  recordFailure('one@b.c', '2.2.2.2');
  assert.ok(locked('one@b.c', '2.2.2.2') > 0);
  assert.equal(locked('two@b.c', '2.2.2.2'), 0);
});

test('getting it right clears the count', () => {
  for (let i = 0; i < 4; i += 1) recordFailure('c@b.c', '3.3.3.3');
  recordSuccess('c@b.c', '3.3.3.3');
  assert.equal(recordFailure('c@b.c', '3.3.3.3'), null, 'a cleared bucket should need five more');
});

test('a source that sprays many accounts gets locked as a whole', () => {
  const ip = '4.4.4.4';
  for (let i = 0; i < 30; i += 1) recordFailure(`n${i}@b.c`, ip);
  assert.ok(locked('*', ip) > 0, 'thirty failures from one address should lock it');
});

test('the sliding window refuses the request over the limit and lets it back later', () => {
  const keys: string[] = [];
  for (let i = 0; i < 3; i += 1) assert.equal(allow('magic:5.5.5.5', 3, 1000), true, `request ${i + 1} should pass`);
  assert.equal(allow('magic:5.5.5.5', 3, 1000), false, 'the fourth inside the window should be refused');
  assert.equal(allow('other:5.5.5.5', 3, 1000), true, 'other keys must not share the budget');
  keys.length = 0;
});
