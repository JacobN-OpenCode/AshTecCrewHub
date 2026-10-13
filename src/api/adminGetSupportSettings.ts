import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { getSupportSummaryMode } from '../../server/supportSummary';

/**
 * Ticket f505c30e: reads the support email mode for the /admin/support toggle.
 * 'per-ticket' emails a maintainer for every new ticket; 'daily' sends one
 * combined summary instead.
 */
export default createEndpoint({
  description: 'Returns the support summary mode (admins)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ mode: z.enum(['per-ticket', 'daily']) }),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);
    return { mode: await getSupportSummaryMode() };
  },
});
