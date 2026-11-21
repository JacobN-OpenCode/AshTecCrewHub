import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

export default createEndpoint({
  description: 'Marks a crew member as a maintainer who receives bug reports (admins)',
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
    await requireAdmin(context.user.email);
    // Ticket 7f2f3e26: an admin toggling their own maintainer status from the
    // Support page used to throw "You can't change your own maintainer status",
    // even though the crew page allows exactly that. An admin may change anyone,
    // including themselves - the action is reversible from the same checkbox.
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
