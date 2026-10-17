import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission } from '../lib/server';

/**
 * The post-show debrief: a shared, running log of how a night went, so lessons
 * are captured while they are fresh. Anyone in the show can add; authors delete
 * their own entries, admins delete any.
 */
export default createEndpoint({
  description: 'Add or remove a post-show debrief note',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    subEventId: z.string().optional(),
    body: z.string().max(4000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.showDebriefs.findOne({ id: input.id });
      if (!existing) throw new Error('Note not found.');
      if (!me.isAdmin && existing.author !== me.id) throw new Error('You can only remove your own notes.');
      await zite.showDebriefs.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const body = (input.body ?? '').trim();
    if (!body) throw new Error('Write something first.');
    const created = await zite.showDebriefs.create({
      record: {
        show: input.showId,
        subEvent: input.subEventId ?? null,
        body: body.slice(0, 4000),
        author: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
