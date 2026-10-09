import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireMember } from '../lib/server';
import { openLiveShow, mapLiveShow, loadLiveShowScenes, loadLiveShowScripts } from '../lib/liveShow';

export default createEndpoint({
  description: 'Live show state for an open show, from the signed-in view',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const liveShow = await openLiveShow();
    if (!liveShow) return { open: false };
    const canEdit = !!me.isAdmin || !!liveShow.crewCanEdit;
    return {
      open: true,
      liveShow: mapLiveShow(liveShow),
      scenes: await loadLiveShowScenes(liveShow.id),
      canEdit,
      scripts: canEdit ? await loadLiveShowScripts(liveShow.id, me.id, !!me.isAdmin) : undefined,
    };
  },
});