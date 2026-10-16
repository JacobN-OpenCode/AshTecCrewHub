import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, mapMember, ids } from '../lib/server';

/**
 * The show-day extras for one show: backstage photos, the running post-show
 * debrief, the green-room noticeboard, the lost property log and the nightly
 * audience counts. Members-only; hidden shows stay staff/admin only.
 */
export default createEndpoint({
  description: 'Show-day extras: photos, debrief, green room, lost property and audience counts',
  authenticated: true,
  inputSchema: z.object({ showId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const { me, mapped } = await requireShowAccess(context.user.email, input.showId);

    const [photos, debriefs, green, lost, counts, subs, members] = await Promise.all([
      zite.showPhotos.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.showDebriefs.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.greenRoomNotes.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.lostProperty.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.audienceCounts.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);

    const nameOf = (id?: string | null) => {
      if (!id) return '';
      const m = members.records.find((x) => x.id === id);
      if (!m) return '';
      const mm = mapMember(m);
      return `${mm.firstName}${mm.lastName ? ' ' + mm.lastName : ''}`;
    };

    const events = subs.records.filter((e) => ids(e.shows).includes(input.showId));
    const byId = new Map(events.map((e) => [e.id, String(e.title ?? e.type ?? '')]));

    return {
      showId: input.showId,
      photos: photos.records
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .map((p) => ({
          id: p.id,
          url: p.url ?? '',
          caption: p.caption ?? '',
          scene: p.scene ?? '',
          byName: nameOf(ids(p.createdBy)[0]),
          createdBy: ids(p.createdBy)[0] ?? null,
          createdAt: p.createdAt ?? null,
        })),
      debriefs: debriefs.records
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .map((d) => ({
          id: d.id,
          subEvent: ids(d.subEvent)[0] ?? null,
          eventName: byId.get(ids(d.subEvent)[0] ?? '') ?? '',
          body: d.body ?? '',
          authorName: nameOf(ids(d.author)[0]),
          createdBy: ids(d.author)[0] ?? null,
          createdAt: d.createdAt ?? null,
        })),
      greenRoom: green.records
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .map((g) => ({
          id: g.id,
          subEvent: ids(g.subEvent)[0] ?? null,
          title: g.title ?? '',
          body: g.body ?? '',
          pinned: !!g.pinned,
          byName: nameOf(ids(g.author)[0]),
          createdBy: ids(g.author)[0] ?? null,
          createdAt: g.createdAt ?? null,
        })),
      lost: lost.records
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .map((l) => ({
          id: l.id,
          item: l.item ?? '',
          description: l.description ?? '',
          location: l.location ?? '',
          status: l.status ?? 'Lost',
          holder: ids(l.holder)[0] ?? null,
          holderName: nameOf(ids(l.holder)[0]),
          notes: l.notes ?? '',
          byName: nameOf(ids(l.createdBy)[0]),
          createdBy: ids(l.createdBy)[0] ?? null,
          createdAt: l.createdAt ?? null,
        })),
      audience: counts.records
        .map((c) => ({
          id: c.id,
          subEvent: ids(c.subEvent)[0] ?? '',
          eventName: byId.get(ids(c.subEvent)[0] ?? '') ?? '',
          count: c.count ?? 0,
          capacity: c.capacity ?? 0,
          notes: c.notes ?? '',
          recordedByName: nameOf(ids(c.recordedBy)[0]),
          recordedAt: c.recordedAt ?? null,
        }))
        .sort((a, b) => String(a.recordedAt ?? '').localeCompare(String(b.recordedAt ?? ''))),
      events: events.map((e) => ({ id: e.id, title: String(e.title ?? e.type ?? ''), type: String(e.type ?? ''), date: e.date ?? null })),
      canDelete: me.isAdmin,
      isAdmin: !!me.isAdmin,
      meId: me.id,
      members: members.records
        .filter((m) => !m.isPreviewAccount)
        .map((m) => {
          const mm = mapMember(m);
          return { id: m.id, firstName: mm.firstName, lastName: mm.lastName };
        })
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    };
  },
});
