/**
 * Ticket 0c2dcf15: "Add advanced settings option in Accessibility to paste a
 * font link to use instead of the default choice of 5."
 *
 * A font link is a stylesheet that carries the @font-face rules, which is what
 * every font site hands you: Google Fonts gives a
 * `<link href="https://fonts.googleapis.com/css2?family=…&display=swap">`, and
 * Bunny, Fontsource and Adobe give the same kind of address. So this file is
 * about the pasted text only, kept away from the React bits so the tests can
 * run it on its own:
 *
 *   - take a plain URL, a whole <link> tag, or an @import line, because that is
 *     what people actually copy off the page;
 *   - http(s) only. Never `javascript:` or a `data:` blob;
 *   - read the family name out of a Google Fonts link, so the common case is
 *     one paste and no typing;
 *   - say plainly what is wrong instead of quietly doing nothing.
 */

/** Longer than any real font link, short enough to keep out of a bad paste. */
export const FONT_LINK_MAX = 500;
export const FONT_FAMILY_MAX = 60;

/** The URL in whatever was pasted. May still be a bad link on purpose. */
export function normaliseFontLink(raw: unknown): string {
  let text = String(raw ?? '').trim();
  if (!text) return '';

  // A pasted <link ... href="…"> tag, which is the usual Google Fonts copy.
  const href = /href\s*=\s*["']([^"']+)["']/i.exec(text);
  if (href) {
    text = href[1];
  } else {
    // Or an @import line, from the "Import" tab of the same panel.
    const imported = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)/i.exec(text);
    if (imported) text = imported[1];
  }

  text = text.replace(/^["']|["']$/g, '').trim();
  if (text.startsWith('//')) text = `https:${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text) && /^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(text)) {
    text = `https://${text}`;
  }
  return text;
}

/** True when the pasted text is a link a browser can be asked to load. */
export function isFontLink(raw: unknown): boolean {
  const link = normaliseFontLink(raw);
  if (!/^https?:\/\//i.test(link) || /[\s<>"]/.test(link)) return false;
  try {
    new URL(link);
    return true;
  } catch {
    return false;
  }
}

/**
 * What is wrong with the pasted link, as one sentence to show under the box,
 * or null when it is usable. The Google Fonts page and the API's own front page
 * are the two things people paste by mistake, so both get their own wording.
 */
export function fontLinkProblem(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return 'Paste the font link first.';
  if (text.length > FONT_LINK_MAX) return `That is a very long link. Keep it under ${FONT_LINK_MAX} characters.`;

  const link = normaliseFontLink(text);
  if (!/^https?:\/\//i.test(link)) return 'The font link has to start with https:// so the browser will load it.';
  if (/[\s<>"]/.test(link)) return 'That does not look like a link. Paste just the address.';

  let host = '';
  let pathname = '';
  try {
    const url = new URL(link);
    host = url.hostname.toLowerCase();
    pathname = url.pathname;
  } catch {
    return 'That is not a link the browser can read.';
  }

  if (host === 'fonts.google.com' || host.endsWith('.fonts.google.com')) {
    return 'That is the Google Fonts page, not the stylesheet. Open the font there, copy the address out of the <link> tag under "Get embed code", and paste that.';
  }
  if (host === 'fonts.googleapis.com' && !pathname.startsWith('/css')) {
    return 'Google font links look like https://fonts.googleapis.com/css2?family=… Copy the one from the <link> tag.';
  }
  if (host === 'fonts.gstatic.com') {
    return 'That is a font file, not a stylesheet. Paste the css2 link from the font’s embed code instead.';
  }
  return null;
}

/** One tidy family name, safe to drop inside quotes in a CSS value. */
export function cleanFontFamily(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\\;{}<>"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FONT_FAMILY_MAX)
    .trim();
}

/**
 * The family name a Google Fonts link asks for, so the name box can be left
 * empty: `family=Open+Sans:wght@400;700` is "Open Sans", and the older API's
 * `family=Open+Sans|Lato` takes the first one. Anything else returns '', and
 * the caller falls back to whatever name was typed.
 */
export function fontFamilyFromLink(raw: unknown): string {
  const link = normaliseFontLink(raw);
  if (!link) return '';
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return '';
  }
  if (!/(^|\.)fonts\.googleapis\.com$/i.test(url.hostname)) return '';

  const asked = url.searchParams.getAll('family').join('|');
  const first = asked.split('|')[0] ?? '';
  const name = first.split(':')[0].replace(/\+/g, ' ');
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    /* a stray % is not worth failing over */
  }
  return cleanFontFamily(decoded);
}

/** A domain to show beside the font in the picker, e.g. "fonts.googleapis.com". */
export function fontLinkHost(raw: unknown): string {
  try {
    return new URL(normaliseFontLink(raw)).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}
