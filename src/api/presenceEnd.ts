import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { activeSession } from '../lib/presence';

/**
 * Closes the venue check-in session. Admins only.
 *
 * Outstanding approval codes are cleared, not left to expire. A code that
 * outlives its session is a liability: someone could photograph the QR, and it
 * would still scan and approve long after the room emptied. Clearing the token
 * makes the link dead the moment the session closes.
 */
export default createEndpoint({
  description: 'Closes the open check-in session and voids any pending approval codes',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ endedAt: z.string(), voided: z.number() }),
  execute: async ({ context }) => {
    const me = await requireAdmin(context.user.email);
    const session = await activeSession();
    if (!session) throw new Error('There is no open check-in session to close.');

    const endedAt = new Date().toISOString();
    await zite.presenceSessions.update({
      id: session.id,
      record: { status: 'Ended', endedAt, endedBy: me.id } as never,
    });

    const { records } = await zite.venuePresence.findAll({
      filters: { session: session.id },
      limit: 2000,
    });
    let voided = 0;
    for (const row of records) {
      if (!row.approvalToken || !row.pendingAction) continue;
      await zite.venuePresence.update({
        id: row.id,
        record: { approvalToken: '', pendingAction: null } as never,
      });
      voided++;
    }

    return { endedAt, voided };
  },
});