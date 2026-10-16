import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * Define the scenes of a show, with who is in each one. Feeds the suggested
 * rehearsal order (grouping scenes by shared cast) and the run-time summary.
 */
export default createEndpoint({
  description: 'Add, edit or remove a show scene',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    label: z.string().max(60).optional(),
    title: z.string().max(200).optional(),
    minutes: z.number().int().min(0).max(600).optional(),
    cast: z.array(z.string().min(1).max(120)).max(200).optional(),
    position: z.number().int().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      if (!me.isAdmin) throw new Error('Only admins can delete scenes.');
      await zite.showScenes.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const cast = input.cast ? [...new Set(input.cast.map((c) => c.trim()).filter(Boolean))].slice(0, 200) : undefined;

    if (input.id) {
      const existing = await zite.showScenes.findOne({ id: input.id });
      if (!existing) throw new Error('Scene not found.');
      const record: Record<string, unknown> = {};
      if (input.label !== undefined) record.label = input.label.slice(0, 60);
      if (input.title !== undefined) record.title = input.title.slice(0, 200);
      if (input.minutes !== undefined) record.minutes = input.minutes;
      if (cast !== undefined) record.cast = cast;
      if (input.position !== undefined) record.position = input.position;
      await zite.showScenes.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const label = (input.label ?? '').trim();
    const title = (input.title ?? '').trim();
    if (!label && !title) throw new Error('Give the scene a name.');
    const created = await zite.showScenes.create({
      record: {
        show: input.showId,
        label: label.slice(0, 60),
        title: title.slice(0, 200),
        minutes: input.minutes ?? 0,
        cast: cast ?? [],
        position: input.position ?? 0,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
