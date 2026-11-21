import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission, ids } from '../lib/server';

/** Rehearsal notes and blocking, per show and optionally per scene or event. */
export default createEndpoint({
  description: 'Add or remove a rehearsal note for a show',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    subEventId: z.string().optional(),
    scene: z.string().max(120).optional(),
    body: z.string().max(4000).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.rehearsalNotes.findOne({ id: input.id });
      if (!existing) throw new Error('Note not found.');
      // Authors can delete their own note; admins can delete any.
      if (ids(existing.author)[0] !== me.id && !me.isAdmin) throw new Error('You can only delete your own notes.');
      await zite.rehearsalNotes.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    if (input.id) {
      const existing = await zite.rehearsalNotes.findOne({ id: input.id });
      if (!existing) throw new Error('Note not found.');
      if (ids(existing.author)[0] !== me.id && !me.isAdmin) throw new Error('You can only edit your own notes.');
      const body = (input.body ?? '').trim();
      if (!body) throw new Error('The note is empty.');
      const record: Record<string, unknown> = { body: body.slice(0, 4000) };
      if (input.scene !== undefined) record.scene = input.scene.slice(0, 120);
      if (input.subEventId !== undefined) record.subEvent = input.subEventId || null;
      await zite.rehearsalNotes.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const body = (input.body ?? '').trim();
    if (!body) throw new Error('Write something first.');
    const created = await zite.rehearsalNotes.create({
      record: {
        show: input.showId,
        subEvent: input.subEventId || null,
        scene: (input.scene ?? '').slice(0, 120),
        body: body.slice(0, 4000),
        author: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
