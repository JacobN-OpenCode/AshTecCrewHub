import assert from 'node:assert/strict';
import test from 'node:test';

import { callTime, describeDay } from '../src/lib/nextCall';
import { formatEventTimeRange } from '../src/lib/icsBuild';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a missing date says so rather than printing "Invalid Date"', () => {
  assert.equal(describeDay(null), 'Date TBC');
});

test('today and tomorrow are named, not dated', () => {
  assert.equal(describeDay(iso(0)), 'Today');
  assert.equal(describeDay(iso(1)), 'Tomorrow');
  assert.equal(describeDay(iso(-1)), 'Yesterday');
});

test('further out gets a short date', () => {
  const out = describeDay(iso(9));
  assert.match(out, /^\w{3} \d{1,2} \w{3}$/, `got "${out}"`);
});

test('the call time is what the crew is told, with a fallback', () => {
  assert.equal(callTime({ startTime: '19:00', meetTime: '18:15' }), '19:00');
  assert.equal(callTime({ startTime: null, meetTime: '18:15' }), '18:15');
  assert.equal(callTime({ startTime: '', meetTime: '' }), '');
});

test('a time range never invents a time it was not given', () => {
  assert.equal(formatEventTimeRange(null, null), '');
  assert.equal(formatEventTimeRange('19:00', '21:00'), '19:00 – 21:00');
  assert.equal(formatEventTimeRange('19:00', null), '19:00 (ends TBC)');
  assert.equal(formatEventTimeRange(null, '21:00'), 'ends 21:00');
});
