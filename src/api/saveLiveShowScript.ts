import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, requireAdmin } from '../lib/server';
import { openLiveShow } from '../lib/liveShow';

export default createEndpoint({
  description: 'Saves a shared or private script for a live show',
  authenticated: true,
  inputSchema: z.object({
    liveShowId: z.string().optional(),
    scope: z.enum(['shared', 'private']),
    content: z.string().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    // Admins may target a specific live show (admin setup page); everyone else
    // works against whichever show is currently open.
    const liveShow = input.liveShowId
      ? await (async () => { await requireAdmin(context.user.email); return zite.liveShows.findOne({ id: input.liveShowId }); })()
      : await openLiveShow();
    if (!liveShow) throw new Error('No live show is open.');
    const content = input.content ?? '';
    if (input.scope === 'shared') {
      if (!me.isAdmin && !liveShow.crewCanEdit) throw new Error('Crew editing is switched off for this show.');
      const existing = await zite.liveShowScripts.findOne({ filters: { liveShowId: liveShow.id, scope: 'shared' } });
      if (existing) {
        await zite.liveShowScripts.update({ id: existing.id, record: { content, updatedBy: me.id } });
      } else {
        await zite.liveShowScripts.create({ record: { liveShowId: liveShow.id, scope: 'shared', authorId: null, content, updatedBy: me.id } });
      }
    } else {
      const existing = await zite.liveShowScripts.findOne({ filters: { liveShowId: liveShow.id, scope: 'private', authorId: me.id } });
      if (existing) {
        await zite.liveShowScripts.update({ id: existing.id, record: { content, updatedBy: me.id } });
      } else {
        await zite.liveShowScripts.create({ record: { liveShowId: liveShow.id, scope: 'private', authorId: me.id, content, updatedBy: me.id } });
      }
    }
    return { saved: true };
  },
});