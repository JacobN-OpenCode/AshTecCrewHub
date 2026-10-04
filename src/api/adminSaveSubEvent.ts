import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, syncAutoAttendance } from '../lib/server';

export default createEndpoint({
  description: 'Creates or updates a rehearsal/performance/club session (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    type: z.enum(['Rehearsal', 'Performance', 'Club Session']),
    subtype: z.string(),
    // A club session is the one type with no show, so this is no longer min(1);
    // execute enforces "at least one show" for everything else.
    showIds: z.array(z.string()),
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
    if (input.type !== 'Club Session' && input.showIds.length === 0) {
      throw new Error('Pick at least one show, or make this a club session.');
    }
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
