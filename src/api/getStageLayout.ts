import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids, mapShow } from '../lib/server';

export default createEndpoint({
  description: 'Lists crew who said Yes/Maybe to each show, with their roles, for the stage layout',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    // Ticket 00c0715c: contractors are external and must not see the stage
    // layout (it lists crew names, years and roles).
    if (me.memberType === 'Contractor') throw new Error('Contractors do not have access to the stage layout.');
    const [shows, members, resps, subs] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ limit: 2000 }),
      zite.subEvents.findAll({ limit: 2000 }),
    ]);
    // Ticket 9f966aab: contractors invited to an event of a production still
    // appear to the crew in that production's stage layout (by name only). This
    // flattens each event's invited contractors onto the shows it belongs to.
    const invites: { showId: string; memberId: string }[] = [];
    for (const e of subs.records) {
      const showIds = (e.shows ?? []) as string[];
      const contractors = (e.contractors ?? []) as string[];
      for (const showId of showIds) for (const memberId of contractors) invites.push({ showId, memberId });
    }
    return {
      shows: shows.records.filter((s) => !s.hidden).map(mapShow),
      members: members.records.map((m) => ({
        id: m.id,
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
        // Same rule as mapMember: username is the email local part.
        shortUsername: (m.schoolEmail ?? '').split('@')[0] || 'member',
        year: m.year ?? '',
        roles: m.roles ?? [],
        headOf: m.headOf ?? [],
        memberType: m.memberType ?? '',
        // Ticket 9f966aab: a contractor's email is never shown to members. The
        // head-of email is for staff contacts, which a contractor can never be.
        email: m.memberType === 'Contractor' ? '' : (m.headOf?.length ? (m.schoolEmail ?? '') : ''),
      })),
      responses: resps.records
        .filter((r) => r.response === 'Yes' || r.response === 'Maybe')
        .map((r) => ({ memberId: ids(r.member)[0] ?? '', showId: ids(r.show)[0] ?? '', response: r.response as string })),
      invites: Array.from(new Map(invites.map((i) => [`${i.showId}|${i.memberId}`, i])).values()),
    };
  },
});
