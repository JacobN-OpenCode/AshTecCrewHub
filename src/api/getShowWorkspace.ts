import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, mapMember, mapSubEvent, ids } from '../lib/server';

/**
 * Everything that hangs off one show, for the show workspace page: the
 * tickable checklist, the lighting/sound cue sheets, the prop and costume
 * inventory, rehearsal notes and scene timings, plus the per-event roll call,
 * sign-offs, cue calls and cover requests. Members-only; hidden shows are
 * visible to staff and admins only.
 */
export default createEndpoint({
  description: 'Show workspace: checklist, cues, props, notes, timings and event ops',
  authenticated: true,
  inputSchema: z.object({ showId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ context, input }) => {
    const { me, mapped } = await requireShowAccess(context.user.email, input.showId);

    const [checklist, cues, props, notes, timings, scenes, subs, members, roll, signs, calls, covers] = await Promise.all([
      zite.showChecklistItems.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.showCues.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.showProps.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.rehearsalNotes.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.sceneTimings.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.showScenes.findAll({ filters: { show: input.showId }, limit: 500 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.rollCalls.findAll({ limit: 5000 }),
      zite.showSignoffs.findAll({ limit: 5000 }),
      zite.cueCalls.findAll({ limit: 5000 }),
      zite.coverRequests.findAll({ limit: 5000 }),
    ]);

    const memberById = new Map(members.records.map((m) => [m.id, mapMember(m)]));
    const nameOf = (id?: string | null) => {
      if (!id) return '';
      const m = memberById.get(id);
      return m ? `${m.firstName}${m.lastName ? ' ' + m.lastName : ''}` : '';
    };

    const events = subs.records.filter((e) => ids(e.shows).includes(input.showId));
    const eventIds = new Set(events.map((e) => e.id));
    const isOurs = (r: { subEvent?: unknown }) => eventIds.has(ids(r.subEvent as never)[0] ?? '');

    const items = checklist.records
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.label).localeCompare(String(b.label)))
      .map((c) => ({
        id: c.id,
        category: c.category ?? '',
        label: c.label ?? '',
        notes: c.notes ?? '',
        position: c.position ?? 0,
        done: !!c.done,
        doneByName: nameOf(c.doneBy),
        doneAt: c.doneAt ?? null,
      }));

    const cueRows = cues.records
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.number).localeCompare(String(b.number)))
      .map((c) => ({
        id: c.id,
        number: c.number ?? '',
        department: c.department ?? 'Lighting',
        scene: c.scene ?? '',
        description: c.description ?? '',
        standby: c.standby ?? '',
        go: c.go ?? '',
        notes: c.notes ?? '',
        position: c.position ?? 0,
      }));

    const propRows = props.records
      .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)))
      .map((p) => ({
        id: p.id,
        name: p.name ?? '',
        category: p.category ?? 'Prop',
        quantity: p.quantity ?? 1,
        location: p.location ?? '',
        holder: ids(p.holder)[0] ?? null,
        holderName: nameOf(ids(p.holder)[0]),
        status: p.status ?? 'Available',
        notes: p.notes ?? '',
      }));

    const noteRows = notes.records
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .map((n) => ({
        id: n.id,
        scene: n.scene ?? '',
        subEvent: ids(n.subEvent)[0] ?? null,
        body: n.body ?? '',
        authorName: nameOf(ids(n.author)[0]),
        createdAt: n.createdAt ?? null,
      }));

    const timingRows = timings.records
      .sort((a, b) => String(a.scene).localeCompare(String(b.scene)))
      .map((t) => ({
        id: t.id,
        scene: t.scene ?? '',
        minutes: t.minutes ?? 0,
        kind: t.kind ?? 'Actual',
        recordedByName: nameOf(ids(t.recordedBy)[0]),
        recordedAt: t.recordedAt ?? null,
      }));

    const sceneRows = scenes.records
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.label).localeCompare(String(b.label)))
      .map((s) => ({
        id: s.id,
        label: s.label ?? '',
        title: s.title ?? '',
        minutes: s.minutes ?? 0,
        cast: (Array.isArray(s.cast) ? s.cast : []).map((c: unknown) => String(c)),
        position: s.position ?? 0,
      }));

    const rollRows = roll.records.filter(isOurs).map((r) => ({
      subEvent: ids(r.subEvent)[0] ?? '',
      member: ids(r.member)[0] ?? '',
      memberName: nameOf(ids(r.member)[0]),
      at: r.at ?? null,
    }));

    const signRows = signs.records.filter(isOurs).map((r) => ({
      subEvent: ids(r.subEvent)[0] ?? '',
      member: ids(r.member)[0] ?? '',
      memberName: nameOf(ids(r.member)[0]),
      role: r.role ?? '',
      note: r.note ?? '',
      at: r.at ?? null,
    }));

    const callRows = calls.records.filter(isOurs).map((r) => ({
      id: r.id,
      subEvent: ids(r.subEvent)[0] ?? '',
      member: ids(r.member)[0] ?? '',
      memberName: nameOf(ids(r.member)[0]),
      message: r.message ?? '',
      byName: nameOf(ids(r.by)[0]),
      at: r.at ?? null,
      ackedAt: r.ackedAt ?? null,
    }));

    const coverRows = covers.records
      .filter(isOurs)
      .map((r) => ({
        id: r.id,
        subEvent: ids(r.subEvent)[0] ?? '',
        member: ids(r.member)[0] ?? '',
        memberName: nameOf(ids(r.member)[0]),
        role: r.role ?? '',
        reason: r.reason ?? '',
        message: r.message ?? '',
        status: r.status ?? 'Open',
        filledBy: ids(r.filledBy)[0] ?? null,
        filledByName: nameOf(ids(r.filledBy)[0]),
        createdAt: r.createdAt ?? null,
      }))
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return {
      show: mapped,
      techLocked: !!mapped.techLocked,
      events: events.map((e) => ({ ...mapSubEvent(e), showId: input.showId })),
      checklist: items,
      cues: cueRows,
      props: propRows,
      notes: noteRows,
      timings: timingRows,
      scenes: sceneRows,
      rollCalls: rollRows,
      signoffs: signRows,
      cueCalls: callRows,
      coverRequests: coverRows,
      canDelete: me.isAdmin,
      isAdmin: !!me.isAdmin,
      meId: me.id,
      members: members.records
        .filter((m) => !m.isPreviewAccount)
        .map((m) => {
          const mm = mapMember(m);
          return { id: m.id, firstName: mm.firstName, lastName: mm.lastName, year: mm.year, avatarUrl: mm.avatarUrl };
        })
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    };
  },
});
