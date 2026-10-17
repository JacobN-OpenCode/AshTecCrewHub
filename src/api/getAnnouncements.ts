import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * The crew-wide announcements feed (Batch 7). Any member can read it; only
 * admins write to it (see saveAnnouncement). Pinned notices float to the top,
 * then newest first, which is the order the page renders.
 */
export default createEndpoint({
  description: 'The crew-wide announcements feed (newest first, pinned first)',
  authenticated: true,
  inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    await requireMember(context.user.email);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const { records } = await zite.announcements.findAll({ limit: 500 });
    const items = records
      .map((a) => ({
        id: String(a.id),
        title: (a.title as string) ?? '',
        body: (a.body as string) ?? '',
        author: (a.author as string) ?? null,
        authorName: (a.authorName as string) ?? '',
        pinned: !!a.pinned,
        createdAt: (a.createdAt as string) ?? '',
        updatedAt: (a.updatedAt as string) ?? '',
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      })
      .slice(0, limit);
    return { items };
  },
});
