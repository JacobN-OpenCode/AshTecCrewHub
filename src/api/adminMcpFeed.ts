import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { ensureFeedKey, feedUrl, rotateFeedKey } from '../../server/mcpFeed';

/**
 * Admin > MCP, the feed part: the address to subscribe to, and a way to
 * replace it if it ends up somewhere it should not be. Ticket 7a7d335c.
 */
export default createEndpoint({
  description: 'Admin: the RSS address of the MCP activity feed, and rotating it.',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['get', 'rotate']),
  }),
  outputSchema: z.object({
    url: z.string(),
  }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user!.email);
    const key = input.action === 'rotate' ? await rotateFeedKey() : await ensureFeedKey();
    return { url: feedUrl(key) };
  },
});
