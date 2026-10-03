import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';

export default createEndpoint({
  description: 'Deletes a rehearsal/performance and its attendance (admins)',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const { records } = await zite.attendance.findAll({ filters: { subEvent: input.id }, limit: 2000 });
    for (const a of records) await zite.attendance.delete({ id: a.id });
    await zite.subEvents.delete({ id: input.id });
    return { success: true };
  },
});
