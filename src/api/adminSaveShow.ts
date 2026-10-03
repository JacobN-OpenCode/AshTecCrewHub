import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';

export default createEndpoint({
  description: 'Creates, updates or deletes a show (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    delete: z.boolean().optional(),
    name: z.string().optional(),
    code: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    dueUnknown: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    if (input.delete && input.id) {
      await zite.shows.delete({ id: input.id });
      return { id: input.id };
    }
    const record = {
      showName: input.name ?? null,
      shortCode: input.code ?? null,
      description: input.description ?? null,
      responseDueDate: input.dueUnknown ? null : (input.dueDate ?? null),
      dueDateUnknown: !!input.dueUnknown,
      hidden: !!input.hidden,
    };
    if (input.id) {
      await zite.shows.update({ id: input.id, record });
      return { id: input.id };
    }
    const created = await zite.shows.create({ record: record as never });
    return { id: created.id };
  },
});
