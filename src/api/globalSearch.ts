import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, isStaff, ids, mapMember } from '../lib/server';

/**
 * Backs the command palette: everything you can jump to that is not a plain
 * page. Events and shows are visible to everyone (respecting hidden), and the
 * crew list mirrors the roster, which is staff-and-admin only - a member never
 * gets a directory of everyone else from here.
 */
export default createEndpoint({
  description: 'Searchable events, shows and crew for the command palette',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const [shows, subs, members] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);
    const canSeeHidden = me.isAdmin;
    const hiddenShowIds = new Set(shows.records.filter((s) => s.hidden).map((s) => s.id));

    const events = subs.records
      .map((e) => ({
        id: e.id,
        title: e.title ?? 'Untitled',
        type: e.type ?? 'Rehearsal',
        date: e.date ?? null,
        dateTbc: !!e.dateTbc,
        hidden: !!e.hidden,
        showIds: ids(e.shows),
      }))
      .filter((e) => canSeeHidden || !e.hidden)
      .filter((e) => canSeeHidden || !(e.showIds.length && e.showIds.every((id) => hiddenShowIds.has(id))))
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
      .map(({ showIds: _showIds, ...rest }) => rest);

    const visibleShows = shows.records
      .filter((s) => canSeeHidden || !s.hidden)
      .map((s) => ({ id: s.id, name: s.showName ?? 'Untitled show', code: s.shortCode ?? '' }));

    // Contractors are external and never get the roster (ticket b89e3fd2), and a
    // member who is not staff gets no crew results at all.
    const canSeeCrew = me.memberType !== 'Contractor' && (isStaff(me) || me.isAdmin);
    const crew = canSeeCrew
      ? members.records
        .filter((m) => !isStaff(m) && !m.isPreviewAccount)
        .map(mapMember)
        .map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          username: m.shortUsername,
          year: m.year,
          memberType: m.memberType,
          avatarUrl: m.avatarUrl,
        }))
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
      : [];

    return { events, shows: visibleShows, members: crew, canSeeCrew };
  },
});
