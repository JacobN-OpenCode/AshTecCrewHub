import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { requireAdmin } from '../lib/server';
import { runDeploy } from '../../server/deploy';

/**
 * The Deploy button at the bottom of Server diagnostics > Logs.
 *
 * Jacob asked to run it himself: "let me run the deploy command at the bottom
 * of the logs tab". It calls the same fixed script the MCP `deploy` tool calls,
 * so there is one deploy to reason about, and it takes no arguments.
 *
 * Admin only, and one confirm in the dialog. Three layers of "yes" for a
 * rebuild is the thing he complained about, not a safety feature.
 */
export default createEndpoint({
  description: 'Admin: update the server from git, build and restart it. One fixed script, no options.',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    ok: z.boolean(),
    dir: z.string(),
    branch: z.string().optional(),
    stoppedAt: z.string().optional(),
    restart: z.string().optional(),
    note: z.string(),
    steps: z.array(z.object({ cmd: z.string(), code: z.number(), tail: z.string() })),
  }),
  execute: async ({ context }) => {
    await requireAdmin(context.user!.email);
    try {
      return await runDeploy();
    } catch (e: any) {
      throw new ZiteError({
        code: 'BAD_REQUEST',
        message: 'Deploy did not start',
        userFacingMessage: e?.message ?? 'A deploy is already running. Give it a minute.',
      });
    }
  },
});
