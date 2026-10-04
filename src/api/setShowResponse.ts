import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { resolveTarget, isPastDue, syncAutoAttendance } from '../lib/server';

export default createEndpoint({
  description: 'Saves a Yes/No/Maybe answer for a show (admins can answer for others)',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string(),
    response: z.enum(['Yes', 'No', 'Maybe']),
    memberId: z.string().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const { member, byAdmin } = await resolveTarget(context.user.email, input.memberId);
    if (!byAdmin && member.memberType === 'Actor') throw new Error('Actors don’t sign up for crew events.');
    const show = await zite.shows.findOne({ id: input.showId });
    if (!show) throw new Error('Show not found.');
    if (!byAdmin && isPastDue(show.responseDueDate, show.dueDateUnknown))
      throw new Error('The response deadline for this show has passed. Speak to an admin.');
    await zite.showResponses.bulkCreate({
      records: [
        {
          responseKey: `${member.id}:${show.id}`,
          member: member.id,
          show: show.id,
          response: input.response,
          enteredByAdmin: byAdmin,
        } as never,
      ],
      matchOn: ['responseKey'],
    });
    await syncAutoAttendance({ memberId: member.id });
    return { success: true };
  },
});
