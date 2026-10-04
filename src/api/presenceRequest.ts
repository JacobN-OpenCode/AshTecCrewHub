import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, wordCount } from '../lib/server';
import { CUSTOM_REASON } from '../lib/constants';
import { findPresence, newToken, presenceKey, requireActiveSession } from '../lib/presence';

/**
 * A member asks to sign in or out. Nothing changes yet: the request parks on
 * their row with a fresh token, and an admin approves it by scanning the QR.
 *
 * Minting a new token on every request is deliberate. Reusing one would let an
 * old screenshot of the QR stay valid, so "the code I photographed earlier"
 * would approve whatever the member asks next.
 */
export default createEndpoint({
  description: 'Requests a venue sign-in or sign-out, returning a one-time approval code',
  authenticated: true,
  inputSchema: z.object({
    previewAs: z.string().optional(),
    action: z.enum(['Sign In', 'Sign Out']),
    reasonLabel: z.string().optional(),
    reason: z.string().optional(),
    comingBack: z.boolean().optional(),
    expectedBackAt: z.string().optional(),
  }),
  outputSchema: z.object({ token: z.string(), pendingAction: z.string() }),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const session = await requireActiveSession();

    const signingOut = input.action === 'Sign Out';
    let reasonLabel = (input.reasonLabel ?? '').trim();
    let reason = (input.reason ?? '').trim();

    if (signingOut) {
      if (!reasonLabel) throw new Error('Please pick a reason for leaving.');
      if (reasonLabel === CUSTOM_REASON && wordCount(reason) < 8)
        throw new Error('Please describe why you are leaving in at least 8 words.');
      // A picked reason says everything, so a leftover typed note would only
      // contradict it on the roster.
      if (reasonLabel !== CUSTOM_REASON) reason = '';
    } else {
      reasonLabel = '';
      reason = '';
    }

    // "Expected Back" needs a time to be expected at, or it says nothing.
    const comingBack = signingOut && !!input.comingBack;
    if (comingBack && !input.expectedBackAt) throw new Error('Please say what time you will be back.');

    const token = newToken();
    const record = {
      presenceKey: presenceKey(session.id, me.id),
      session: session.id,
      member: me.id,
      pendingAction: input.action,
      approvalToken: token,
      reasonLabel,
      reason,
      comingBack,
      expectedBackAt: comingBack ? (input.expectedBackAt ?? null) : null,
      updatedBy: me.id,
    } as never;

    // State and the signed timestamps are deliberately untouched: a request is
    // not the decision, and the member's current state stays on the roster while
    // an admin decides.
    const existing = await findPresence(session.id, me.id);
    if (existing) await zite.venuePresence.update({ id: existing.id, record });
    else await zite.venuePresence.create({ record });

    return { token, pendingAction: input.action };
  },
});