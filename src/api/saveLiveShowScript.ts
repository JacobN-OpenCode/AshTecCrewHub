import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { openLiveShow } from '../lib/liveShow';

/**
 * The show script: a single embedded OneDrive PDF link, set by an admin.
 *
 * Ticket f75f7b40 replaced the old shared-text-plus-private-link setup. There is
 * exactly one script field now, and it always points at OneDrive; the dashboard
 * embeds it, nobody pastes script text into the app.
 */
export default createEndpoint({
  description: 'Sets the OneDrive script link for a live show',
  authenticated: true,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    sharedLink: z.string().max(2000),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const liveShow = input.liveShowId
      ? await zite.liveShows.findOne({ id: input.liveShowId })
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');
    const record: Record<string, unknown> = { sharedLink: input.sharedLink.trim(), updatedBy: admin.id };
    const existing = await zite.liveShowScripts.findOne({ filters: { liveShowId: liveShow.id, scope: 'shared' } });
    if (existing) {
      await zite.liveShowScripts.update({ id: String(existing.id), record });
    } else {
      await zite.liveShowScripts.create({
        record: { liveShowId: liveShow.id, scope: 'shared', authorId: null, ...record } as never,
      });
    }
    return { saved: true, sharedLink: input.sharedLink.trim() };
  },
});
