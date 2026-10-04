import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, ids, mapShow, mapSubEvent } from '../lib/server';

export default createEndpoint({
  description: 'Lists shows and sub-events with the signed-in member’s responses',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const [shows, subs, resps, att] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ filters: { member: me.id }, limit: 500 }),
      zite.attendance.findAll({ filters: { member: me.id }, limit: 2000 }),
    ]);
    const respMap = new Map(resps.records.map((r) => [ids(r.show)[0], r.response ?? null]));
    const attMap = new Map(att.records.map((a) => [ids(a.subEvent)[0], a]));
    // Admins can hide a show or rehearsal from members. An event disappears with
    // its show if every show it belongs to is hidden.
    const hiddenShowIds = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));
    return {
      shows: shows.records
        .filter((s) => !s.hidden)
        .map((s) => ({ ...mapShow(s), response: (respMap.get(s.id) ?? null) as string | null })),
      subEvents: subs.records
        .map((e) => ({
          ...mapSubEvent(e),
          status: (attMap.get(e.id)?.status ?? null) as string | null,
          reason: attMap.get(e.id)?.reason ?? '',
        }))
        .filter((e) => !e.hidden && !(e.showIds.length && e.showIds.every((id) => hiddenShowIds.has(id))))
        .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
    };
  },
});
