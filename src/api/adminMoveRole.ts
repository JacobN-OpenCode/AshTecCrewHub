import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';

export default createEndpoint({
  description: 'Moves a crew member from one role area to another (admins)',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string(), from: z.string(), to: z.string() }),
  outputSchema: z.object({ roles: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const m = await zite.crewMembers.findOne({ id: input.memberId });
    if (!m) throw new Error('Member not found.');
    let roles = (m.roles ?? []).filter((r) => r !== input.from);
    if (input.to !== 'Unassigned' && !roles.includes(input.to)) roles = [...roles, input.to];
    await zite.crewMembers.update({ id: m.id, record: { roles } });
    return { roles };
  },
});
