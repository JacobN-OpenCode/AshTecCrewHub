/**
 * The theme layer is the part nobody can typecheck their way out of: a missing
 * palette, a variable that is not a colour, or a theme that quietly stops sharing
 * the layout all look fine to tsc and wrong on screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { DEFAULT_PALETTE, DEFAULT_THEME, THEMES, findPalette, findTheme, themeVars } from '../src/lib/themes';

const HSL = /^\d{1,3} \d{1,3}% \d{1,3}%$/;

test('the original look is there and is the one we fall back to', () => {
  assert.ok(THEMES.some((t) => t.id === DEFAULT_THEME));
  assert.equal(findTheme(DEFAULT_THEME).id, DEFAULT_THEME);
});

test('every theme can be described without opening the code', () => {
  for (const t of THEMES) {
    assert.ok(t.name.trim(), `${t.id} has no name`);
    assert.ok(t.blurb.trim(), `${t.id} has no blurb`);
    assert.ok(t.from.trim(), `${t.id} does not say where it came from`);
  }
});

test('theme ids and palette ids are unique', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate theme id in ${ids.join(', ')}`);
  for (const t of THEMES) {
    const p = t.palettes.map((x) => x.id);
    assert.equal(new Set(p).size, p.length, `${t.id} has a duplicate palette id`);
  }
});

test('every theme offers palettes, and at least one of them changes something', () => {
  for (const t of THEMES) {
    assert.ok(t.palettes.length >= 3, t.id + ' only has ' + t.palettes.length + ' palette(s)');
    for (const p of t.palettes) assert.ok(p.name.trim() && p.blurb.trim(), t.id + '/' + p.id + ' is missing a name or blurb');
    // The first palette is the theme's own colours, so it may override nothing;
    // the rest have to actually be a different colour or the pill does nothing.
    const changing = t.palettes.slice(1).filter((p) => Object.keys(p.over).length > 0);
    assert.ok(changing.length > 0, t.id + ' has no palette that changes the colour');
  }
});

test('every colour variable is a bare HSL triplet, which is what the CSS expects', () => {
  for (const t of THEMES) {
    for (const [k, v] of Object.entries(t.base)) {
      assert.match(v, HSL, `${t.id} base ${k} is "${v}"`);
    }
    for (const p of t.palettes) {
      for (const [k, v] of Object.entries(p.over)) {
        assert.match(v, HSL, `${t.id}/${p.id} ${k} is "${v}"`);
      }
    }
  }
});

test('a palette only overrides variables the theme already defines', () => {
  for (const t of THEMES) {
    for (const p of t.palettes) {
      for (const k of Object.keys(p.over)) {
        assert.ok(k in t.base, `${t.id}/${p.id} sets ${k}, which ${t.id} never defines`);
      }
    }
  }
});

test('themeVars returns the same keys whatever palette is picked', () => {
  for (const t of THEMES) {
    const keys = Object.keys(themeVars(t.id)).sort().join(',');
    for (const p of t.palettes) {
      assert.equal(Object.keys(themeVars(t.id, p.id)).sort().join(','), keys, `${t.id}/${p.id} leaks a different key set`);
    }
  }
});

test('picking a palette actually changes the colour', () => {
  const a = themeVars('cakeshop', 'cherry');
  const b = themeVars('cakeshop', 'cocoa');
  assert.equal(a['--type-scale'] ?? '', b['--type-scale'] ?? '');
  assert.notEqual(a['--primary'], b['--primary']);
});

test('an unknown theme or palette falls back instead of throwing', () => {
  assert.equal(findTheme('nope').id, DEFAULT_THEME);
  assert.equal(findPalette('cakeshop', 'nope').id, THEMES.find((t) => t.id === 'cakeshop')!.palettes[0].id);
  assert.ok(themeVars('nope', 'nope')['--background']);
  assert.equal(findPalette(DEFAULT_THEME).id, DEFAULT_PALETTE === 'amber' ? 'amber' : findPalette(DEFAULT_THEME).id);
});

test('every theme shares one layout instead of shipping its own shell', () => {
  const appShell = readFileSync(join(import.meta.dirname, '../src/components/AppShell.tsx'), 'utf8');
  const home = readFileSync(join(import.meta.dirname, '../src/pages/Home.tsx'), 'utf8');
  const css = readFileSync(join(import.meta.dirname, '../src/index.css'), 'utf8');

  assert.ok(!/SHELLS/.test(appShell), 'AppShell.tsx still picks a shell per theme');
  assert.ok(!/DASHES/.test(home), 'Home.tsx still picks a dashboard per theme');
  assert.ok(!/ThemeBand/.test(appShell), 'AppShell.tsx still renders a per-theme band');

  // Ticket 1bbe2d65: a look may repaint the page, never re-measure it.
  for (const t of THEMES) {
    assert.ok(!new RegExp(`\\[data-theme=['\"]${t.id}['\"]\\]\\s*\\.app-(main|sidebar)[^{]*\\{[^}]*max-width`).test(css), `index.css still gives "${t.id}" its own page width`);
  }
});
