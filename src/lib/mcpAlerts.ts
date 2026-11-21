/**
 * Which MCP calls are worth telling a person about, and what the message says.
 *
 * Ticket 7a7d335c: "send a message every time the MCP does something. Not
 * simple things like listing the tools or authorising the token, but changed
 * to be made." So a call is news only if it changed a row somewhere. Pure
 * functions only, so both the server and the tests can import this.
 */

/** Tools that write. Everything else is a read, a handshake or a list. */
export const CHANGING_TOOLS = new Set([
  'deploy',
  'set_register',
  'mark_attendance',
  'control_live_show',
  'send_live_show_chat',
  'reply_to_ticket',
  'close_ticket',
  'update_ticket',
  'add_document',
  'post_announcement',
  'save_theme',
  'delete_theme',
]);

/** True when this call changed something, so somebody may want to know. */
export function isWorthTelling(tool: string): boolean {
  return CHANGING_TOOLS.has(String(tool || '').trim());
}

/** A webhook is only usable if it really is a Slack incoming webhook. */
export function looksLikeSlackWebhook(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{10,200}$/.test(String(url || '').trim());
}

/** Show enough of the URL to recognise it, never enough to use it. */
export function maskWebhook(url: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  const tail = u.slice(-6);
  return `https://hooks.slack.com/services/…${tail}`;
}

/** Slack mrkdwn: the actor in bold, the tool in code, the change underneath. */
export function slackText(input: { who: string; tool: string; detail?: string; at?: Date }): string {
  const who = String(input.who || 'Someone').trim().slice(0, 80) || 'Someone';
  const tool = String(input.tool || '').trim().slice(0, 60);
  const detail = String(input.detail || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  const when = (input.at ?? new Date()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const head = `*${who}* used \`${tool}\` at ${when}`;
  return detail ? `${head}\n> ${detail}` : head;
}
