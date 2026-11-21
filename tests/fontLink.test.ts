/**
 * Ticket 0c2dcf15: "Add ability to use any font from a webfont link."
 *
 * The pasted text is the risky half of that feature: it decides what the browser
 * is told to fetch, and the name that goes inside quotes in a CSS value. These
 * run on every pull request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT_FAMILY_MAX,
  cleanFontFamily,
  fontFamilyFromLink,
  fontLinkHost,
  fontLinkProblem,
  isFontLink,
  normaliseFontLink,
} from '../src/lib/fontLink';

const GOOGLE = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap';

test('a plain link is taken as it is', () => {
  assert.equal(normaliseFontLink(GOOGLE), GOOGLE);
  assert.equal(normaliseFontLink(`  ${GOOGLE}  `), GOOGLE);
});

test('a whole <link> tag or an @import line is understood, because that is what people copy', () => {
  assert.equal(
    normaliseFontLink(`<link href="${GOOGLE}" rel="stylesheet">`),
    GOOGLE,
  );
  assert.equal(
    normaliseFontLink(`<link rel='stylesheet' href='${GOOGLE}' />`),
    GOOGLE,
  );
  assert.equal(normaliseFontLink(`@import url('${GOOGLE}');`), GOOGLE);
  assert.equal(normaliseFontLink(`@import "${GOOGLE}";`), GOOGLE);
  assert.equal(normaliseFontLink(`"${GOOGLE}"`), GOOGLE);
});

test('a missing scheme is filled in, and a protocol-relative link kept on https', () => {
  assert.equal(
    normaliseFontLink('fonts.googleapis.com/css2?family=Inter'),
    'https://fonts.googleapis.com/css2?family=Inter',
  );
  assert.equal(
    normaliseFontLink('//fonts.googleapis.com/css2?family=Inter'),
    'https://fonts.googleapis.com/css2?family=Inter',
  );
});

test('nothing else becomes a link', () => {
  for (const bad of ['', '   ', 'Open Sans', 'hello world', 'javascript:alert(1)', 'data:text/css,@font-face{}']) {
    assert.equal(isFontLink(bad), false, `${bad} should not count as a font link`);
  }
  assert.equal(normaliseFontLink(null), '');
  assert.equal(normaliseFontLink(undefined), '');
});

test('the two Google pages people paste by mistake are named, not swallowed', () => {
  assert.match(String(fontLinkProblem('https://fonts.google.com/specimen/Open+Sans')), /Google Fonts page/);
  assert.match(String(fontLinkProblem('https://fonts.googleapis.com/?family=Open+Sans')), /css2/);
  assert.match(String(fontLinkProblem('https://fonts.gstatic.com/s/opensans/v1/abc.woff2')), /font file/);
});

test('a link has to be http(s), a certain length, and readable', () => {
  assert.match(String(fontLinkProblem('')), /Paste the font link/);
  assert.match(String(fontLinkProblem('javascript:alert(1)')), /https:\/\//);
  assert.match(String(fontLinkProblem(`https://example.com/${'a'.repeat(600)}.css`)), /under 500/);
  assert.equal(fontLinkProblem(GOOGLE), null);
  assert.equal(fontLinkProblem('https://cdn.example.org/fonts/school.css'), null);
});

test('the family name is read out of a Google Fonts link, so one paste is enough', () => {
  assert.equal(fontFamilyFromLink(GOOGLE), 'Open Sans');
  assert.equal(fontFamilyFromLink('https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap'), 'Inter');
  // The older API's pipe-separated list takes the first family it asks for.
  assert.equal(fontFamilyFromLink('https://fonts.googleapis.com/css?family=Roboto|Lato'), 'Roboto');
  // css2 can repeat family=, and people often ask for two at once.
  assert.equal(fontFamilyFromLink('https://fonts.googleapis.com/css2?family=Inter&family=Lato'), 'Inter');
  assert.equal(fontFamilyFromLink('https://fonts.googleapis.com/css2?family=Open%20Sans'), 'Open Sans');
});

test('any other host says nothing, so the name box has to be typed', () => {
  assert.equal(fontFamilyFromLink('https://cdn.example.org/fonts/school.css'), '');
  assert.equal(fontFamilyFromLink(''), '');
});

test('a family name is one tidy line with nothing CSS could trip on', () => {
  assert.equal(cleanFontFamily('  Open   Sans '), 'Open Sans');
  assert.equal(cleanFontFamily("'Noto Sans'; color: red"), 'Noto Sans color: red');
  assert.equal(cleanFontFamily('a"b`c{d}e<f>g\\h'), 'a b c d e f g h');
  assert.ok(cleanFontFamily('x'.repeat(200)).length <= FONT_FAMILY_MAX);
  assert.equal(cleanFontFamily(null), '');
});

test('the picker can say which site the font comes from', () => {
  assert.equal(fontLinkHost(GOOGLE), 'fonts.googleapis.com');
  assert.equal(fontLinkHost('https://www.example.org/a.css'), 'example.org');
  assert.equal(fontLinkHost('nonsense'), '');
});
