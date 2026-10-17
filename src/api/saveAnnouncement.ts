import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, mapMember } from '../lib/server';
import { notifyAnnouncement } from '../../server/notify';

/**
 * Create, edit, pin or remove a crew announcement (Batch 7). Admins only.
 *
 * Creating one fans a push out to the crew (notifyAnnouncement); editing or
 * re-pinning does not, so fixing a typo never re-pings everyone.
 */
export default createEndpoint({
  description: 'Create, edit, pin or remove a crew announcement (admin)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    title: z.string().max(200).optional(),
    body: z.string().max(10000).optional(),
    pinned: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const me = await requireAdmin(context.user.email);
    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      await zite.announcements.delete({ id: input.id });
      return { ok: true, id: input.id };
    }
    if (input.id) {
      const existing = await zite.announcements.findOne({ id: input.id });
      if (!existing) throw new Error('Announcement not found.');
      const record: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (input.title !== undefined) record.title = input.title.slice(0, 200);
      if (input.body !== undefined) record.body = input.body.slice(0, 10000);
      if (input.pinned !== undefined) record.pinned = !!input.pinned;
      await zite.announcements.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }
    const title = (input.title ?? '').trim();
    const body = (input.body ?? '').trim();
    if (!title) throw new Error('Give the announcement a title.');
    if (!body) throw new Error('Give the announcement some content.');
    const authorName = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || mapMember(me).email;
    const created = await zite.announcements.create({
      record: {
        title: title.slice(0, 200),
        body: body.slice(0, 10000),
        author: me.id,
        authorName,
        pinned: !!input.pinned,
      } as never,
    });
    const id = String(created.id);
    // Push the crew. Best-effort: a push failure must not fail the post.
    try {
      await notifyAnnouncement({ id, title: title.slice(0, 200), body: body.slice(0, 200), authorName });
    } catch {
      /* the announcement is saved regardless */
    }
    return { ok: true, id };
  },
});
