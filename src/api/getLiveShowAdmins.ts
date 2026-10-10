import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';

/**
 * The admin roster (id + name) for the movement-alert picker on the live show
 * dashboard (ticket f75f7b40). Public on purpose: a stage machine behind the
 * show code configures movement alerts without a signed-in session. Admin names
 * are already public in the crew list, the support tab and the calendar footer,
 * so this reveals nothing new. No emails are returned.
 */
export default createEndpoint({
  description: 'Lists admin members (id and name) for the movement-alert picker',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({
    admins: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  execute: async () => {
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const admins = records
      .filter((m) => !!m.isAdmin)
      .map((m) => ({ id: String(m.id), name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Admin' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { admins };
  },
});
