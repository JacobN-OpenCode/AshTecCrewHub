/**
 * Email sending, replacing `zitejs/email`.
 *
 * The app talks to this through a tiny surface -- `Email.send({ to, subject,
 * replyTo?, body })` returning `{ success, messageId }` -- which is exactly what
 * the five endpoints that send mail expect, including `result?.messageId`,
 * which gets stored on SupportReplies.emailMessageId.
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

/**
 * Endpoint bodies are written in markdown-ish plain text (`**bold**`, blank-line
 * paragraphs, no HTML), so convert rather than injecting raw HTML. Only the
 * constructs we ourselves emit are honoured.
 */
function textToHtml(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px">${para.replace(/\n/g, '<br />').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('\n');
}

function renderHtml(blocks: EmailBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      parts.push(textToHtml(block.content));
    } else {
      const href = safeHref(block.href);
      parts.push(
        `<p style="margin:22px 0"><a href="${href}" style="background:#f59e0b;color:#1a1206;` +
          `padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">` +
          `${escapeText(block.label)}</a></p>`
      );
    }
  }
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1c1917;max-width:560px">${parts.join('\n')}</div>`;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Only ever allow http(s), so a stored value can never inject `javascript:`. */
function safeHref(href: string): string {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '#';
  } catch {
    return '#';
  }
}

export const Email = {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(
      (x): x is string => typeof x === 'string' && x.includes('@')
    );
    if (recipients.length === 0) throw new Error('Email.send called with no valid recipient');

    const html = renderHtml(params.body);

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
      text: params.body
        .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
        .map((b) => b.content)
        .join('\n\n'),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    return { success: true, messageId: info.messageId };
  },
};