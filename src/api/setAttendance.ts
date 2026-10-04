import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { resolveTarget, isPastDue, wordCount, ids, upsertAttendance } from '../lib/server';

const NOT = ['Not Attending', 'Not Attending Event'];
const AUTO_REASON = 'Automatic: not attending any performances, so cannot attend rehearsals.';

export default createEndpoint({
  description: 'Saves attendance for one or more rehearsals/performances',
  authenticated: true,
  inputSchema: z.object({
    memberId: z.string().optional(),
    items: z.array(
      z.object({
        subEventId: z.string(),
        status: z.enum(['Expected Arrival', 'Maybe', 'Not Attending']),
        reason: z.string().optional(),
      }),
    ),
  }),
  outputSchema: z.object({ rehearsalsCancelled: z.number() }),
  execute: async ({ input, context }) => {
    const { member, byAdmin } = await resolveTarget(context.user.email, input.memberId);
    if (!byAdmin && member.memberType === 'Actor') throw new Error('Actors don’t sign up for crew events.');
    const subs = (await zite.subEvents.findAll({ limit: 2000 })).records;
    const byId = new Map(subs.map((s) => [s.id, s]));

    for (const it of input.items) {
      const s = byId.get(it.subEventId);
      if (!s) throw new Error('Event not found.');
      if (!byAdmin && isPastDue(s.responseDueDate, s.dueDateUnknown))
        throw new Error(`The deadline for "${s.title}" has passed.`);
      if (!byAdmin && it.status === 'Not Attending' && wordCount(it.reason) < 8)
        throw new Error('Please give a reason of at least 8 words when you can’t attend.');
    }
    await upsertAttendance(
      input.items.map((i) => ({
        memberId: member.id,
        subEventId: i.subEventId,
        status: i.status,
        reason: i.status === 'Not Attending' ? i.reason : '',
        byAdmin,
      })),
    );

    // No performances attended for a show => cannot attend its rehearsals.
    const att = (await zite.attendance.findAll({ filters: { member: member.id }, limit: 2000 })).records;
    const st = new Map(att.map((a) => [ids(a.subEvent)[0], a.status]));
    const touched = new Set(input.items.flatMap((i) => ids(byId.get(i.subEventId)?.shows)));
    const cancel: string[] = [];
    for (const showId of touched) {
      const inShow = subs.filter((s) => ids(s.shows).includes(showId));
      const perfs = inShow.filter((s) => s.type === 'Performance');
      if (!perfs.length || !perfs.every((p) => NOT.includes(st.get(p.id) ?? ''))) continue;
      inShow
        .filter((s) => s.type === 'Rehearsal' && !NOT.includes(st.get(s.id) ?? ''))
        .forEach((s) => cancel.push(s.id));
    }
    const unique = [...new Set(cancel)];
    await upsertAttendance(
      unique.map((id) => ({ memberId: member.id, subEventId: id, status: 'Not Attending', reason: AUTO_REASON, byAdmin })),
    );
    return { rehearsalsCancelled: unique.length };
  },
});
