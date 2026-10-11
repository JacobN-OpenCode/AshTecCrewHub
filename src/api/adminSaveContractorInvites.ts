import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/**
 * Ticket 9f966aab "Contractor Invite": invite one contractor across the events
 * of a production. The admin ticks which events (the "parts") they are needed
 * for and writes a single overall message; this writes the contractor into each
 * ticked event's contractor list and copies the overall message onto them.
 * Unticked events drop the contractor, and an event that ends up with no
 * contractors clears its message so a stale invite can never linger.
 */
export default createEndpoint({
  description: 'Invites a contractor to selected events of a show, with one overall message (admins)',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    contractorId: z.string().min(1),
    eventIds: z.array(z.string()),
    message: z.string(),
  }),
  outputSchema: z.object({ invited: z.number(), removed: z.number() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);

    const [members, subs] = await Promise.all([
      zite.crewMembers.findAll({ limit: 5000 }),
      zite.subEvents.findAll({ limit: 2000 }),
    ]);
    const contractor = members.records.find((m) => m.id === input.contractorId);
    if (!contractor || contractor.memberType !== 'Contractor') {
      throw new Error('Pick a contractor account to invite.');
    }

    const inShow = subs.records.filter((s) => (s.shows ?? []).includes(input.showId));
    const chosen = new Set(input.eventIds);
    let invited = 0;
    let removed = 0;

    for (const e of inShow) {
      const current = (e.contractors ?? []) as string[];
      const has = current.includes(input.contractorId);
      const want = chosen.has(e.id);
      if (want === has) {
        // Already right, but keep the overall message in step when it changed.
        if (want && (e.contractorMessage ?? '') !== input.message) {
          await zite.subEvents.update({ id: e.id, record: { contractorMessage: input.message } as never });
        }
        continue;
      }
      if (want) {
        await zite.subEvents.update({
          id: e.id,
          record: { contractors: [...current, input.contractorId], contractorMessage: input.message, needsContractors: true } as never,
        });
        invited += 1;
      } else {
        const next = current.filter((x) => x !== input.contractorId);
        await zite.subEvents.update({
          id: e.id,
          record: { contractors: next, needsContractors: next.length > 0, contractorMessage: next.length > 0 ? (e.contractorMessage ?? '') : '' } as never,
        });
        removed += 1;
      }
    }
    return { invited, removed };
  },
});
