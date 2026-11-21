import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { requireAdmin } from '../lib/server';
import { maskWebhook } from '../lib/mcpAlerts';
import { readMcpSlack, saveMcpSlack, postToSlack } from '../../server/mcpSlack';

/**
 * Admin > MCP, the Slack part: where alerts go, whether they are on, and a
 * button that proves Slack can hear us. Ticket 7a7d335c.
 */
export default createEndpoint({
  description: 'Admin: read, save or test the Slack webhook the MCP posts to when a tool changes something.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['get', 'save', 'test']),
    webhook: z.string().max(400).optional(),
    on: z.boolean().optional(),
  }),
  outputSchema: z.object({
    webhook: z.string(),
    on: z.boolean(),
    saved: z.boolean().optional(),
    sent: z.boolean().optional(),
    message: z.string().optional(),
  }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user!.email);

    if (input.action === 'get') {
      const cfg = await readMcpSlack();
      return { webhook: maskWebhook(cfg.webhook), on: cfg.on };
    }

    if (input.action === 'save') {
      try {
        const cfg = await saveMcpSlack({ webhook: input.webhook, on: input.on });
        return { webhook: maskWebhook(cfg.webhook), on: cfg.on, saved: true };
      } catch (e: any) {
        throw new ZiteError({
          code: 'BAD_REQUEST',
          message: 'BadWebhook',
          userFacingMessage: e?.message ?? 'That webhook did not work.',
        });
      }
    }

    // action === 'test'
    const cfg = await readMcpSlack();
    if (!cfg.webhook) {
      throw new ZiteError({
        code: 'BAD_REQUEST',
        message: 'NoWebhook',
        userFacingMessage: 'Save a webhook first, then there is something to test.',
      });
    }
    const result = await postToSlack('*AshTec Crew Hub* · test message from Admin > MCP. Alerts work.');
    return { webhook: maskWebhook(cfg.webhook), on: cfg.on, sent: result.ok, message: result.message };
  },
});
