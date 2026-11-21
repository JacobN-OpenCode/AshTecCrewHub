/**
 * Ticket 36b2cc84: the rules a theme made by an AI has to pass before it is
 * allowed to repaint somebody's screen. These run on every pull request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CUSTOM_THEMES,
  buildVars,
  cleanBase,
  cleanThemeName,
  isHslTriplet,
  normaliseVars,
  themeProblem,
} from '../src/lib/customTheme';
import { THEMES, themeVars } from '../src/lib/themes';

test('a colour has to be an HSL triplet the stylesheet can use', () => {
  assert.ok(isHslTriplet('280 60% 55%'));
  assert.ok(isHslTriplet('0 0% 100%'));
  assert.ok(isHslTriplet(' 12 3% 4% '));
  for (const bad of ['#ff0000', '280, 60%, 55%', '280 60', '', null, 42, '361 60% 55%', '280 101% 55%', '280 60% 155%']) {
    assert.equal(isHslTriplet(bad as unknown), false, `${String(bad)} should be refused`);
  }
});

test('names are one tidy line and never longer than the box', () => {
  assert.equal(cleanThemeName('  Midnight   plum '), 'Midnight plum');
  assert.equal(cleanThemeName('x'.repeat(120)).length, 40);
  assert.equal(cleanThemeName(undefined), '');
  assert.equal(cleanThemeName(null), '');
});

test('an unknown base falls back to the original look', () => {
  assert.equal(cleanBase('cakeshop'), 'cakeshop');
  assert.equal(cleanBase('nonsense'), 'ashtec');
  assert.equal(cleanBase(''), 'ashtec');
  assert.equal(cleanBase(undefined), 'ashtec');
});

test('only real colour variables survive, in the form given', () => {
  const kept = normaliseVars({
    '--primary': '280 60% 55%',
    '--background': '270 20% 10%',
    'theme': '280 60% 55%',
    '--broken': '#fff',
    ['--tooLong' + 'x'.repeat(60)]: '280 60% 55%',
  });
  assert.deepEqual(kept, { '--primary': '280 60% 55%', '--background': '270 20% 10%' });
  assert.deepEqual(normaliseVars(null), {});
  assert.deepEqual(normaliseVars('nope'), {});
});

test('a built theme carries every variable, not only the ones it changed', () => {
  const base = themeVars('intelly', 'butter');
  const vars = buildVars('intelly', 'butter', { '--primary': '280 60% 55%' });
  assert.deepEqual(Object.keys(vars).sort(), Object.keys(base).sort());
  assert.equal(vars['--primary'], '280 60% 55%');
});

test('a variable the base look does not use is ignored, so nothing is invented', () => {
  const vars = buildVars('ashtec', 'amber', { '--made-up': '10 10% 10%' });
  assert.equal('--made-up' in vars, false);
});

test('an unknown palette still gives a usable set of colours', () => {
  const vars = buildVars('quiet', 'no-such-palette', {});
  assert.deepEqual(vars, themeVars('quiet', 'sage'));
});

test('every built-in look can be the base of a made theme', () => {
  for (const theme of THEMES) {
    const vars = buildVars(theme.id, theme.palettes[0].id, {});
    for (const [key, value] of Object.entries(vars)) {
      assert.ok(isHslTriplet(value), `${theme.id} ${key} = ${value}`);
    }
  }
});

test('a theme needs a name and at least one colour', () => {
  assert.equal(themeProblem('', { '--primary': '1 1% 1%' }), 'Give the theme a name.');
  assert.equal(themeProblem('Plum', {}), 'A theme needs at least one colour.');
  assert.equal(themeProblem('Plum', { '--primary': '1 1% 1%' }), null);
});

test('there is a limit, so one person cannot fill the table', () => {
  assert.ok(MAX_CUSTOM_THEMES > 0 && MAX_CUSTOM_THEMES <= 50);
});
