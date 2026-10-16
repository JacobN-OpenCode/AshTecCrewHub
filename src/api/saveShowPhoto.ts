import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * Add, caption or remove a backstage photo. Photos are referenced by URL (the
 * same no-upload approach used for member avatars), so nothing is stored in the
 * database but the link. Anyone in the show can add; admins or the uploader can
 * remove.
 */
export default createEndpoint({
  description: 'Add, caption or remove a backstage photo by URL',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    url: z.string().max(1000).optional(),
    caption: z.string().max(300).optional(),
    scene: z.string().max(120).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.showPhotos.findOne({ id: input.id });
      if (!existing) throw new Error('Photo not found.');
      if (!me.isAdmin && existing.createdBy !== me.id) throw new Error('You can only remove your own photos.');
      await zite.showPhotos.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    if (input.id) {
      const existing = await zite.showPhotos.findOne({ id: input.id });
      if (!existing) throw new Error('Photo not found.');
      if (!me.isAdmin && existing.createdBy !== me.id) throw new Error('You can only edit your own photos.');
      const record: Record<string, unknown> = {};
      if (input.caption !== undefined) record.caption = input.caption.slice(0, 300);
      if (input.scene !== undefined) record.scene = input.scene.slice(0, 120);
      await zite.showPhotos.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const url = (input.url ?? '').trim();
    if (!/^https?:\/\/\S+$/.test(url)) throw new Error('Paste a link to the photo (https://…).');
    const created = await zite.showPhotos.create({
      record: {
        show: input.showId,
        url: url.slice(0, 1000),
        caption: (input.caption ?? '').slice(0, 300),
        scene: (input.scene ?? '').slice(0, 120),
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
