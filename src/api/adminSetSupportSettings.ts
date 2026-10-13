import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { setSupportSummaryMode } from '../../server/supportSummary';

export default createEndpoint({
  description: 'Sets whether new support tickets email each maintainer or a single daily summary (admins)',
  authenticated: true,
  inputSchema: z.object({ mode: z.enum(['per-ticket', 'daily']) }),
  outputSchema: z.object({ success: z.boolean(), mode: z.string() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    await setSupportSummaryMode(input.mode);
    return { success: true, mode: input.mode };
  },
});
