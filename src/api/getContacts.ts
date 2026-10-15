import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember } from '../lib/server';

export default createEndpoint({
  description: 'Return crew members who opted into the contact sheet (members-only)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireMember(context.user.email);
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const contacts = records
      .filter((m) => (m as unknown as { contactShare?: boolean }).contactShare)
      .map(mapMember)
      .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
    return { contacts };
  },
});
