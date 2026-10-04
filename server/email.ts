/**
 * Email sending, replacing `zitejs/email`.
 *
 * The app talks to this through a tiny surface -- `Email.send({ to, subject,
 * replyTo?, body })` returning `{ success, messageId }` -- which is exactly what
 * the five endpoints that send mail expect, including `result?.messageId`,
 * which gets stored on SupportReplies.emailMessageId.
 *
 * Bodies are written in a small markdown subset (`**bold**`, `_italic_`,
 * `~~strike~~`, `[label](href)`, `> quote`, `- list`, `---` rule). We render that
 * ourselves rather than injecting HTML, so a stored value can never smuggle
 * markup or a javascript: link into an email.
 *
 * Transport is SMTP via Nodemailer. If SMTP is not configured we do NOT silently
 * pretend to send: we log the rendered message to stdout and report success with
 * a dev message id, so local work and the magic-link flow are usable without
 * credentials. That fallback is deliberately loud so it can never be mistaken
 * for real delivery in production.
 */

import nodemailer, { type Transporter } from 'nodemailer';

export type EmailBlock =
  | { type: 'text'; content: string }
  | { type: 'button'; label: string; href: string };

export interface SendEmailParams {
  to?: string | string[];
  subject: string;
  replyTo?: string;
  body: EmailBlock[];
  /** Reserved by the original SDK; the app never sets it. */
  direction?: 'ltr' | 'rtl';
}

export interface SendEmailResult {
  success: boolean;
  messageId: string;
}

const FROM = process.env.EMAIL_FROM ?? 'AshTec Crew <crew@ashtec.hackclub.app>';

// One place for the look, so every email matches. Light, because mail clients
// render dark backgrounds badly and strip them in dark mode anyway.
const INK = '#1c1917';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const ACCENT = '#f59e0b';
const ACCENT_INK = '#1a1206';
const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

let transporter: Transporter | null = null;

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // Port 465 is implicit TLS; everything else starts plaintext and upgrades.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Only http(s) and mailto, so a stored value can never inject `javascript:`. */
function safeHref(href: string): string {
  try {
    const u = new URL(href.trim());
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.toString() : '#';
  } catch {
    return '#';
  }
}

/**
 * Inline markdown -> HTML. Links are matched on the RAW string first (so an
 * `&` inside a query string is not already `&amp;` when safeHref parses it),
 * everything else is escaped, then bold/strike/italic are applied.
 */
function renderInline(raw: string): string {
  const out: string[] = [];
  const link = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = link.exec(raw))) {
    out.push(escapeText(raw.slice(last, m.index)));
    out.push(
      `<a href="${escapeText(safeHref(m[2]))}" style="color:#b45309;text-decoration:underline">${escapeText(m[1])}</a>`
    );
    last = m.index + m[0].length;
  }
  out.push(escapeText(raw.slice(last)));

  return out
    .join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^_\w])_([^_]+?)_(?!_)/g, '$1<em>$2</em>');
}

/** Block markdown -> HTML: paragraphs, blockquotes, lists and `---` rules. */
function renderBlocks(raw: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p style="margin:0 0 15px;color:${INK}">${para.map(renderInline).join('<br />')}</p>`);
      para = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(
        `<blockquote style="margin:0 0 15px;padding:6px 0 6px 14px;border-left:3px solid ${LINE};color:${MUTED}">` +
          `${quote.map(renderInline).join('<br />')}</blockquote>`
      );
      quote = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      out.push(
        `<ul style="margin:0 0 15px;padding-left:20px;color:${INK}">` +
          `${list.map((li) => `<li style="margin:0 0 5px">${renderInline(li)}</li>`).join('')}</ul>`
      );
      list = [];
    }
  };

  for (const line of raw.split('\n')) {
    const q = line.match(/^>\s?(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    if (li) { flushPara(); flushQuote(); list.push(li[1]); continue; }
    flushQuote();
    flushList();
    if (/^\s*-{3,}\s*$/.test(line)) { flushPara(); out.push(`<hr style="border:0;border-top:1px solid ${LINE};margin:18px 0" />`); continue; }
    if (line.trim() === '') { flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  flushQuote();
  flushList();
  return out.join('\n');
}

/** The button as a table, because Outlook ignores padding on inline-block anchors. */
function renderButton(label: string, href: string): string {
  const safe = escapeText(safeHref(href));
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>` +
    `<td style="border-radius:999px;background:${ACCENT}">` +
    `<a href="${safe}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;` +
    `font-weight:700;color:${ACCENT_INK};text-decoration:none;border-radius:999px">${escapeText(label)}</a>` +
    `</td></tr></table>`
  );
}

/** Plain-text version. Crucially, button links become real URLs, not nothing. */
export function renderText(blocks: EmailBlock[]): string {
  return blocks
    .map((b) => (b.type === 'text' ? b.content : `${b.label}:\n${b.href}`))
    .join('\n\n');
}

export function renderHtml(blocks: EmailBlock[], subject: string): string {
  const content = blocks
    .map((b) => (b.type === 'text' ? renderBlocks(b.content) : renderButton(b.label, b.href)))
    .join('\n');

  // A short preheader: the first real sentence, which mail clients show next to
  // the subject line instead of "View this email in your browser".
  const firstText = blocks.find((b): b is { type: 'text'; content: string } => b.type === 'text');
  const preheader = (firstText?.content ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_~>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${escapeText(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeText(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">
<tr><td style="padding:28px 26px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">
${content}
</td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">
AshTec Crew Hub &middot; Ashford School Tech Crew
</p>
</td></tr>
</table>
</body>
</html>`;
}

export const Email = {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(
      (x): x is string => typeof x === 'string' && x.includes('@')
    );
    if (recipients.length === 0) throw new Error('Email.send called with no valid recipient');

    const html = renderHtml(params.body, params.subject);
    const text = renderText(params.body);

    if (!smtpConfigured()) {
      const devId = `dev-${Date.now().toString(36)}`;
      console.warn(
        `[email] SMTP not configured -- NOT SENT (${devId}). to=${recipients.join(', ')} subject=${JSON.stringify(params.subject)}`
      );
      for (const block of params.body) {
        if (block.type === 'text') console.warn(`[email] ${devId} text: ${block.content}`);
        else console.warn(`[email] ${devId} button: ${block.label} -> ${block.href}`);
      }
      return { success: true, messageId: devId };
    }

    const info = await getTransporter().sendMail({
      from: FROM,
      to: recipients.join(', '),
      subject: params.subject,
      html,
      text,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    return { success: true, messageId: info.messageId };
  },
};
