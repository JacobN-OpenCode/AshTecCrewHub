import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';

export default createEndpoint({
  description: 'Marks a crew member as a maintainer who receives bug reports and feature requests (admins)',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string(), value: z.boolean() }),
  // The member is echoed back so the Support page updates its list in place
  // rather than refetching every table.
  outputSchema: z.object({
    success: z.boolean(),
    member: z.object({
      id: z.string(), firstName: z.string(), lastName: z.string(),
      isAdmin: z.boolean(), isMaintainer: z.boolean(),
    }),
  }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);
    if (input.memberId === me.id) throw new Error('You can’t change your own maintainer status.');
    const member = await zite.crewMembers.findOne({ id: input.memberId });
    if (!member) throw new Error('That crew member no longer exists.');
    // Maintainers are emailed about tickets and then need to open the Support
    // tab, so they have to be admins.
    if (input.value && !member.isAdmin) throw new Error('Maintainers have to be admins.');

    await zite.crewMembers.update({ id: input.memberId, record: { isMaintainer: input.value } });
    return {
      success: true,
      member: {
        id: member.id,
        firstName: member.firstName ?? '',
        lastName: member.lastName ?? '',
        isAdmin: !!member.isAdmin,
        isMaintainer: input.value,
      },
    };
  },
});
