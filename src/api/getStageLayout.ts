import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireMember, ids, mapShow } from '../lib/server';

export default createEndpoint({
  description: 'Lists crew who said Yes/Maybe to each show, with their roles, for the stage layout',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireMember(context.user.email);
    const [shows, members, resps] = await Promise.all([
      zite.shows.findAll({ limit: 200 }),
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ limit: 2000 }),
    ]);
    return {
      shows: shows.records.filter((s) => !s.hidden).map(mapShow),
      members: members.records.map((m) => ({
        id: m.id,
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
        year: m.year ?? '',
        roles: m.roles ?? [],
        headOf: m.headOf ?? [],
        memberType: m.memberType ?? '',
        email: m.headOf?.length ? (m.schoolEmail ?? '') : '',
      })),
      responses: resps.records
        .filter((r) => r.response === 'Yes' || r.response === 'Maybe')
        .map((r) => ({ memberId: ids(r.member)[0] ?? '', showId: ids(r.show)[0] ?? '', response: r.response as string })),
    };
  },
});
