import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember } from '../lib/server';

/**
 * The crew skills directory (Batch 7): "who can teach me this?".
 *
 * Every non-preview member who has listed something they can teach, plus the
 * distinct set of teach tags across the crew for the filter chips. Members who
 * only want to learn are still listed (with an empty teach list) so you can see
 * who is learning what, but the chip list is built from teach tags only.
 */
export default createEndpoint({
  description: 'Who can teach what: the crew skills directory',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireMember(context.user.email);
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });

    const list = (raw: unknown) =>
      String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    const people = records
      .filter((m) => !m.isPreviewAccount && m.memberType !== 'Contractor')
      .map((m) => {
        const mm = mapMember(m);
        return {
          id: mm.id,
          name: `${mm.firstName} ${mm.lastName}`.trim() || mm.email,
          avatarUrl: mm.avatarUrl ?? '',
          year: mm.year ?? '',
          roles: mm.roles ?? [],
          teach: list((m as Record<string, unknown>).skillsTeach),
          learn: list((m as Record<string, unknown>).skillsLearn),
        };
      })
      .filter((p) => p.teach.length || p.learn.length);

    const tagCounts = new Map<string, number>();
    for (const p of people) {
      for (const t of p.teach) {
        const key = t;
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
      }
    }
    const tags = [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    return { people, tags };
  },
});
