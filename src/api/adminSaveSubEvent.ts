import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin, syncAutoAttendance } from '../lib/server';

export default createEndpoint({
  description: 'Creates or updates a rehearsal/performance (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    type: z.enum(['Rehearsal', 'Performance']),
    subtype: z.string(),
    showIds: z.array(z.string()).min(1),
    date: z.string().nullable(),
    dateTbc: z.boolean(),
    description: z.string(),
    meetTime: z.string(),
    timings: z.string(),
    thingsToBring: z.string(),
    importance: z.enum(['High', 'Medium', 'Low']),
    dueDate: z.string().nullable(),
    dueUnknown: z.boolean(),
    hidden: z.boolean().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    const record = {
      title: input.title,
      type: input.type,
      subtype: input.subtype || null,
      shows: input.showIds,
      date: input.dateTbc ? null : input.date,
      dateTbc: input.dateTbc,
      description: input.description,
      meetTime: input.meetTime,
      timings: input.timings,
      thingsToBring: input.thingsToBring,
      importance: input.importance,
      responseDueDate: input.dueUnknown ? null : input.dueDate,
      dueDateUnknown: input.dueUnknown,
      hidden: !!input.hidden,
    };
    let id = input.id;
    if (id) await zite.subEvents.update({ id, record });
    else id = (await zite.subEvents.create({ record: record as never })).id;
    await syncAutoAttendance({ subEventId: id });
    return { id };
  },
});
