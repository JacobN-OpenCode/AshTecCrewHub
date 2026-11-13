import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { getSupportSummaryMode, isSupportEmailMode } from '../../server/supportSummary';

/**
 * Ticket d1ae2a76 "Personalised email settings" and 09b3e402 "Summary vs per
 * ticket emails": how *this* member wants support-ticket email.
 *
 * It used to be one app-wide switch, which meant one person's preference changed
 * everybody's inbox. The site-wide value now only sets the default: '' keeps
 * following it, 'per-ticket' asks for every ticket as it is raised, and 'daily'
 * asks for the one-a-day summary instead.
 *
 * Only support email is affected. Admin/operational mail (a form due, a check-in
 * prompt) is not a preference and stays as it is.
 */
export default createEndpoint({
  description: 'Save how this member wants support-ticket email (per ticket, daily, or follow the site default)',
  authenticated: true,
  inputSchema: z.object({ mode: z.string() }),
  outputSchema: z.object({ ok: z.boolean(), mode: z.string(), siteMode: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const mode = isSupportEmailMode(input.mode) ? input.mode : '';
    await zite.crewMembers.update({ id: me.id, record: { supportEmailMode: mode } as never });
    const siteMode = await getSupportSummaryMode();
    return { ok: true, mode, siteMode };
  },
});
