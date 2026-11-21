import assert from 'node:assert/strict';
import test from 'node:test';

import { remindOutcome } from '../src/lib/remindOutcome';

test('a reminder that went out sounds like it worked', () => {
  assert.equal(remindOutcome({ emailed: 2, reminded: 1 }).kind, 'success');
  assert.match(remindOutcome({ emailed: 2, reminded: 1 }).text, /2 emailed/);
  assert.match(remindOutcome({ emailed: 3, reminded: 4 }).text, /4 tickets/);
});

test('work found but nobody to email is an error, not a success', () => {
  const out = remindOutcome({ emailed: 0, reminded: 2 });
  assert.equal(out.kind, 'error');
  assert.match(out.text, /no maintainer/);
});

test('there is always a sentence, even when nothing happened', () => {
  assert.equal(remindOutcome({ emailed: 0, reminded: 0 }).kind, 'info');
  assert.match(remindOutcome({ emailed: 0, reminded: 0, skipped: 'closed' }).text, /already closed/);
  assert.match(remindOutcome({ emailed: 0, reminded: 0, skipped: 'waiting-on-reporter' }).text, /waiting on the person/);
});
