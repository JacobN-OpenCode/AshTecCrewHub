/**
 * Ticket 183f94e4: "Deploy button isnt working of admins ... It doesnt work
 * when you click it".
 *
 * The question appeared, centred and readable, over the open Activity log, and
 * every click on it did nothing. A modal Radix dialog sets `pointer-events:
 * none` on the body so nothing behind it takes a click, and only its own layer
 * turns that back on. This dialog is drawn outside that layer, so it inherited
 * the `none` and swallowed the press. Nothing in tsc or a unit test of the
 * deploy endpoint would ever have caught it, so these checks pin the two lines
 * that make the click land.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const src = readFileSync(join(process.cwd(), 'src/lib/dialogs.tsx'), 'utf8');

test('the question turns pointer events back on for itself', () => {
  assert.match(
    src,
    /style=\{\{ pointerEvents: 'auto' \}\}/,
    'the dialog host does not re-enable pointer events, so clicks pass through it',
  );
});

test('a press in the question does not reach the dialog underneath', () => {
  // Without this, Radix reads the press as a click outside the Activity log and
  // closes it, and the deploy steps go with it.
  assert.match(src, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
});

test('Escape and Enter are handled before the dialog underneath hears them', () => {
  assert.match(
    src,
    /window\.addEventListener\('keydown', onKey, true\)/,
    'the key handler has to listen in the capture phase',
  );
  assert.match(src, /e\.stopPropagation\(\);/);
  assert.match(src, /window\.removeEventListener\('keydown', onKey, true\)/);
});

test('the fix says which ticket it is for', () => {
  assert.match(src, /183f94e4/);
});

test('nothing in the app falls back to window.confirm', () => {
  // The macOS web view never draws them, so a confirm there is a dead button.
  const files = ['src/lib/dialogs.tsx', 'src/components/admin/LogsDialog.tsx', 'src/pages/admin/LiveShowAdmin.tsx'];
  for (const f of files) {
    const text = readFileSync(join(process.cwd(), f), 'utf8');
    assert.ok(!/window\.confirm\(/.test(text), f + ' still calls window.confirm');
  }
});
