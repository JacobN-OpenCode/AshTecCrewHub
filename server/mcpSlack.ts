/**
 * The Slack side of the MCP: where the webhook lives, and the one function
 * that posts to it.
 *
 * Tickets 7a7d335c (a message when the MCP changes something) and the reason
 * this is a webhook rather than a bot: an incoming webhook needs no Slack app,
 * no scopes and no token sitting in the repo. An admin makes one in Slack and
 * pastes the URL into Admin -> MCP.
 */
import { db } from '#db';
import { looksLikeSlackWebhook, slackText, isWorthTelling } from '../src/lib/mcpAlerts.js';

/** Where the webhook is kept: one row in the generic Settings table. */
export const MCP_SLACK_KEY = 'mcpSlack';

export type McpSlack = { webhook: string; on: boolean };

/** Read the setting. Missing or malformed means "off", never a throw. */
export async function readMcpSlack(): Promise<McpSlack> {
  try {
    const { rows } = await db().query('SELECT "value" FROM "Settings" WHERE "key" = $1', [MCP_SLACK_KEY]);
    const raw = rows[0]?.value as Partial<McpSlack> | undefined;
    const webhook = typeof raw?.webhook === 'string' ? raw.webhook.trim() : '';
    // Saved through saveMcpSlack, which is where the address is checked, so
    // trust the switch here: a bad fetch fails quietly rather than loudly.
    return { webhook, on: !!raw?.on && !!webhook };
  } catch {
    return { webhook: '', on: false };
  }
}

/** Save it. Empty webhook turns the whole thing off. */
export async function saveMcpSlack(input: { webhook?: string; on?: boolean }): Promise<McpSlack> {
  const current = await readMcpSlack();
  const webhook = input.webhook === undefined ? current.webhook : String(input.webhook).trim();
  if (webhook && !looksLikeSlackWebhook(webhook)) {
    throw new Error('That does not look like a Slack webhook. Copy the whole https://hooks.slack.com/services/… address.');
  }
  const on = input.on === undefined ? current.on : !!input.on;
  const next: McpSlack = { webhook, on: on && !!webhook };
  await db().query(
    'INSERT INTO "Settings" ("key", "value", "updatedAt") VALUES ($1, $2::jsonb, now()) ' +
      'ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now()',
    [MCP_SLACK_KEY, JSON.stringify(next)],
  );
  return next;
}

/** Post whatever it is given. Returns whether Slack took it. Never throws. */
export async function postToSlack(text: string): Promise<{ ok: boolean; message: string }> {
  const cfg = await readMcpSlack();
  if (!cfg.webhook) return { ok: false, message: 'No Slack webhook is set.' };
  try {
    const res = await fetch(cfg.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `Slack said ${res.status}. ${body.slice(0, 160)}` };
    }
    return { ok: true, message: 'Slack took it.' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Could not reach Slack.' };
  }
}

/**
 * Called after a call that changed something, from inside the MCP handler.
 * Fire and forget: a Slack outage must never fail a tool call.
 */
export async function tellSlack(key: { name: string; memberId?: string }, tool: string, detail: string): Promise<void> {
  try {
    if (!isWorthTelling(tool)) return;
    const cfg = await readMcpSlack();
    if (!cfg.on) return;
    const who = await nameFor(key);
    await postToSlack(slackText({ who, tool, detail }));
  } catch {
    // Swallowed on purpose: see above.
  }
}

/** The person (or agent) the key acts as, else the key's own name. */
async function nameFor(key: { name: string; memberId?: string }): Promise<string> {
  const id = String(key.memberId ?? '');
  if (id) {
    try {
      const { rows } = await db().query('SELECT "firstName", "lastName" FROM "CrewMembers" WHERE "id" = $1 LIMIT 1', [id]);
      const m = rows[0] as { firstName?: string; lastName?: string } | undefined;
      const name = `${m?.firstName ?? ''} ${m?.lastName ?? ''}`.trim();
      if (name) return name;
    } catch {
      // fall through to the key name
    }
  }
  return key.name;
}
