import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DROP_MARGIN, SNACKS, hitsCat, nextSnack, pageBox } from '../src/lib/catSnack';

/** The companion draws the cat at 56px; this box stands in for where it sits. */
const CAT = { left: 100, top: 500, right: 156, bottom: 558 };

test('there are at least two snacks and each one has something to say', () => {
  assert.ok(SNACKS.length >= 2);
  assert.equal(new Set(SNACKS.map((s) => s.id)).size, SNACKS.length);
  for (const snack of SNACKS) {
    assert.ok(['burger', 'steak'].includes(snack.id));
    assert.ok(snack.label.length > 0);
    assert.ok(snack.line.length > 0);
    // The bubble is 220px wide with a little padding; a long line would wrap it.
    assert.ok(snack.line.length <= 60, `${snack.label} line is too long`);
  }
});

test('the first snack is the first in the list', () => {
  assert.equal(nextSnack(null).id, SNACKS[0].id);
});

test('a different snack turns up after each one is eaten', () => {
  for (const snack of SNACKS) {
    assert.notEqual(nextSnack(snack.id).id, snack.id);
  }
});

test('a drop in the middle of the cat counts', () => {
  assert.equal(hitsCat({ x: 128, y: 529 }, CAT), true);
});

test('a drop just outside the cat still counts, within the margin', () => {
  assert.equal(hitsCat({ x: CAT.left - DROP_MARGIN + 1, y: 529 }, CAT), true);
  assert.equal(hitsCat({ x: 128, y: CAT.bottom + DROP_MARGIN - 1 }, CAT), true);
});

test('a drop across the page does not feed anything', () => {
  assert.equal(hitsCat({ x: 600, y: 200 }, CAT), false);
  assert.equal(hitsCat({ x: CAT.left - DROP_MARGIN - 1, y: 529 }, CAT), false);
});

test('a scrolled page needs the scroll adding before the drop is tested', () => {
  const box = pageBox(CAT, { x: 0, y: 1200 });
  assert.deepEqual(box, { left: 100, top: 1700, right: 156, bottom: 1758 });
  // The same viewport drop now misses, which is why the conversion matters.
  assert.equal(hitsCat({ x: 128, y: 529 }, box), false);
  assert.equal(hitsCat({ x: 128, y: 1729 }, box), true);
});

test('the companion is wired to the feeding logic', () => {
  const source = readFileSync(new URL('../src/components/CatCompanion.tsx', import.meta.url), 'utf8');
  assert.match(source, /from '\.\.\/lib\/catSnack'/);
  assert.match(source, /onDragEnd=\{\(_event, info\) => droppedAt\(info\.point\)\}/);
  assert.match(source, /hitsCat\(point, box\)/);
  assert.match(source, /playSfx\('nom'\)/);
  assert.match(source, /<SnackIcon id=\{meal\.id\}/);
});
