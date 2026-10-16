import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * Tech Week mode: locks a show's plan down so nothing shifts under the crew's
 * feet once tech starts. Admins only.
 */
export default createEndpoint({
  description: 'Lock or unlock a show for Tech Week (admins only)',
  authenticated: true,
  inputSchema: z.object({ showId: z.string().min(1), locked: z.boolean() }),
  outputSchema: z.object({ ok: z.boolean(), locked: z.boolean(), lockedByName: z.string() }),
  execute: async ({ context, input }) => {
    const { me, show } = await requireShowAccess(context.user.email, input.showId);
    if (!me.isAdmin) throw new Error('Admins only.');

    await zite.shows.update({
      id: show.id,
      record: {
        techLocked: input.locked,
        techLockedAt: input.locked ? new Date().toISOString() : null,
        techLockedBy: input.locked ? me.id : null,
      },
    });
    return { ok: true, locked: input.locked, lockedByName: input.locked ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() : '' };
  },
});
