import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, ids } from '../lib/server';

/**
 * Record how long a scene actually ran (or an estimate). Rows accumulate, so a
 * scene's average across rehearsals is the "learned" run-time.
 */
export default createEndpoint({
  description: 'Record a scene run-time (actual or estimate)',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    scene: z.string().max(120).optional(),
    minutes: z.number().int().min(0).max(600).optional(),
    kind: z.enum(['Actual', 'Estimate']).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.sceneTimings.findOne({ id: input.id });
      if (!existing) throw new Error('Timing not found.');
      if (ids(existing.recordedBy)[0] !== me.id && !me.isAdmin) throw new Error('You can only remove your own timings.');
      await zite.sceneTimings.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const scene = (input.scene ?? '').trim();
    if (!scene) throw new Error('Which scene?');
    const minutes = input.minutes ?? 0;
    const created = await zite.sceneTimings.create({
      record: {
        show: input.showId,
        scene: scene.slice(0, 120),
        minutes,
        kind: input.kind ?? 'Actual',
        recordedBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
