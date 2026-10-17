import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission } from '../lib/server';

/**
 * The green-room noticeboard: call times, messages and morale for the cast.
 * Anyone in the show can post; authors delete their own notes, admins delete
 * any and anyone can pin (pinning is show-wide, not destructive).
 */
export default createEndpoint({
  description: 'Post, pin or remove a green-room notice',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    title: z.string().max(200).optional(),
    body: z.string().max(4000).optional(),
    pinned: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.greenRoomNotes.findOne({ id: input.id });
      if (!existing) throw new Error('Notice not found.');
      if (!me.isAdmin && existing.author !== me.id) throw new Error('You can only remove your own notices.');
      await zite.greenRoomNotes.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    if (input.id) {
      const existing = await zite.greenRoomNotes.findOne({ id: input.id });
      if (!existing) throw new Error('Notice not found.');
      const record: Record<string, unknown> = {};
      if (input.pinned !== undefined) record.pinned = input.pinned;
      if (input.title !== undefined) record.title = input.title.slice(0, 200);
      if (input.body !== undefined) record.body = input.body.slice(0, 4000);
      await zite.greenRoomNotes.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const body = (input.body ?? '').trim();
    if (!body) throw new Error('Write something first.');
    const created = await zite.greenRoomNotes.create({
      record: {
        show: input.showId,
        title: (input.title ?? '').slice(0, 200),
        body: body.slice(0, 4000),
        pinned: input.pinned ?? false,
        author: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
