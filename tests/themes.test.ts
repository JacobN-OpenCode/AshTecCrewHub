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

/**
 * A look paints its sidebar and its card edge with fixed light colours rather
 * than with the semantic variables. Those rules come after the base stylesheet's
 * dark ones, so unless each is answered in dark mode the look keeps a cream
 * sidebar and pale card outlines on a dark page.
 */
/** Every `selector { declarations }` pair in the stylesheet. */
function cssRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

test('a look that fixes a shell colour in light mode repaints it in dark mode', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/index.css'), 'utf8');
  const rules = cssRules(css);

  // The two places a look sets colour directly instead of through a variable.
  const surfaces = [
    { what: 'the sidebar', target: '.app-sidebar', light: /(^|[;\s])background\s*:/ },
    { what: 'the card edge', target: '.bg-card', light: /(^|[;\s])border-color\s*:/ },
  ];

  for (const t of THEMES) {
    for (const surface of surfaces) {
      const light = rules.find((r) => r.selector === `[data-theme='${t.id}'] ${surface.target}`);
      if (!light || !surface.light.test(light.body)) continue;

      const dark = rules.find(
        (r) =>
          /\bhtml\.dark\b/.test(r.selector) &&
          r.selector.includes(surface.target) &&
          (r.selector.includes(`[data-theme='${t.id}']`) || r.selector.includes(":not([data-theme='ashtec'])")),
      );
      assert.ok(
        dark && surface.light.test(dark.body),
        `index.css paints "${t.id}" ${surface.what} in light mode but never restates it under html.dark`,
      );
    }
  }
});

/**
 * The ticket asked for two new looks by name: a High School Musical Jr one, and a
 * Christmas one that is "red, green and gold everywhere" with tree decorations
 * hanging over it. Colour and decoration are the parts of that a test can hold
 * still, so keep the three hues and the hanging baubles where the ticket put them.
 */
function hueOf(value: string): number {
  return Number(value.split(' ')[0]);
}

test('the Christmas look keeps the red, green and gold the ticket asked for', () => {
  const christmas = findTheme('christmas');
  assert.equal(christmas.name, 'Christmas');
  assert.equal(christmas.palettes.length, 3);

  const page = hueOf(christmas.base['--background']);
  const buttons = hueOf(christmas.base['--primary']);
  const ring = hueOf(christmas.base['--ring']);

  assert.ok(page >= 140 && page <= 175, 'the page should be pine green');
  assert.ok(buttons <= 12 || buttons >= 348, 'the buttons should be holly red');
  assert.ok(ring >= 35 && ring <= 50, 'the focus ring should be gold');

  const gold = findPalette('christmas', 'gold');
  const goldButton = hueOf(gold.over['--primary']);
  assert.ok(goldButton >= 35 && goldButton <= 50, 'the gold palette should actually be gold');
});

test('the Christmas look hangs decorations, not only a new set of colours', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/index.css'), 'utf8');
  const rules = cssRules(css);

  // One bauble is a ball plus its thread, so a decoration layer is a radial
  // gradient and a thread is a repeating gradient in the same rule.
  const page = rules.find((r) => r.selector.endsWith("[data-theme='christmas'] .spotlight"));
  assert.ok(page, 'the Christmas look should paint the page itself');
  assert.ok(/radial-gradient\(circle at 50%/.test(page.body), 'the page should have baubles hanging on it');
  assert.ok(/repeating-linear-gradient/.test(page.body), 'the baubles should hang from threads');

  const sidebar = rules.find((r) => r.selector.endsWith("[data-theme='christmas'] .app-sidebar"));
  assert.ok(sidebar && /radial-gradient/.test(sidebar.body), 'the sidebar should carry a garland');
});

test('the High School Musical Jr look is a lit stage, not another dashboard', () => {
  const show = findTheme('opening-night');
  assert.equal(show.name, 'Opening Night');
  assert.equal(show.palettes.length, 3);

  const css = readFileSync(join(import.meta.dirname, '../src/index.css'), 'utf8');
  const rules = cssRules(css);
  const stage = rules.find((r) => r.selector.endsWith("[data-theme='opening-night'] .spotlight"));
  assert.ok(stage && /radial-gradient/.test(stage.body), 'the page should be lit by a spot');
  const headings = rules.find((r) => r.selector.endsWith("[data-theme='opening-night'] :is(h1, h2)"));
  assert.ok(headings && /Fraunces/.test(headings.body), 'headings should be set like a playbill');
});
