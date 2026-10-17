import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember } from '../lib/server';

/**
 * A minimal crew directory so a member can start a new conversation (Batch 7).
 * Preview accounts and contractors are excluded; this is the same population
 * that appears in the rest of the crew-facing app, reduced to what a picker
 * needs.
 */
export default createEndpoint({
  description: 'A minimal crew directory for starting a direct message',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireMember(context.user.email);
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const people = records
      .filter((m) => !m.isPreviewAccount && m.memberType !== 'Contractor')
      .map((m) => {
        const mm = mapMember(m);
        return {
          id: mm.id,
          name: `${mm.firstName} ${mm.lastName}`.trim() || mm.email,
          avatarUrl: mm.avatarUrl ?? '',
          year: mm.year ?? '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { people };
  },
});
