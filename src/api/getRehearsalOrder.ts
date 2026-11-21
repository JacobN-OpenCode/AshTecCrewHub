import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess } from '../lib/server';

/**
 * Suggests a rehearsal order that groups scenes by who is in them, so people
 * are not sat around for three hours to say one line.
 *
 * Greedy clustering: start from the first scene, then repeatedly pull in the
 * next scene that shares the most cast with the people still working, which
 * keeps each cast group together. When nothing overlaps, a new block starts.
 */
export default createEndpoint({
  description: 'Suggested rehearsal order that groups scenes by cast (rehearsal shuffle)',
  authenticated: true,
  inputSchema: z.object({ showId: z.string().min(1) }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    await requireShowAccess(context.user.email, input.showId);
    const { records } = await zite.showScenes.findAll({ filters: { show: input.showId }, limit: 500 });

    const scenes = records
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.label).localeCompare(String(b.label)))
      .map((s) => ({
        id: s.id,
        label: s.label ?? '',
        title: s.title ?? '',
        minutes: s.minutes ?? 0,
        cast: (Array.isArray(s.cast) ? s.cast : []).map((c: unknown) => String(c).trim()).filter(Boolean),
      }));

    if (!scenes.length) return { order: [], totalMinutes: 0, actors: [], blocks: 0 };

    const remaining = [...scenes];
    const ordered: { scene: (typeof scenes)[number]; block: number }[] = [];
    let active = new Set<string>();
    let block = 0;

    while (remaining.length) {
      let best = remaining[0];
      let bestScore = -1;
      for (const s of remaining) {
        const overlap = s.cast.reduce((n, name) => n + (active.has(name) ? 1 : 0), 0);
        // Overlap first; then bigger scenes, then the original script order.
        const score = overlap * 1000 + s.cast.length * 10;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      const overlap = best.cast.reduce((n, name) => n + (active.has(name) ? 1 : 0), 0);
      if (!active.size) {
        block = 0;
        active = new Set(best.cast);
      } else if (overlap === 0) {
        // Nobody still working is in this one: open a new block for its cast.
        block += 1;
        active = new Set(best.cast);
      } else {
        for (const name of best.cast) active.add(name);
      }
      ordered.push({ scene: best, block });
      remaining.splice(remaining.indexOf(best), 1);
    }

    const actors = [...new Set(scenes.flatMap((s) => s.cast))];
    return {
      order: ordered.map(({ scene, block: b }) => ({ ...scene, block: b })),
      totalMinutes: scenes.reduce((n, s) => n + s.minutes, 0),
      actors,
      blocks: Math.max(...ordered.map((o) => o.block)) + 1,
    };
  },
});
