import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * Upcoming crew birthdays over the next N days, with the age-free month/day
 * only. Birthday is stored as MM-DD (never a year), so this is a simple cyclic
 * comparison rather than date arithmetic.
 */
export default createEndpoint({
  description: 'Crew birthdays in the next 30 days (members only)',
  authenticated: true,
  inputSchema: z.object({ days: z.number().int().min(1).max(90).optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    await requireMember(context.user.email);
    const window = input.days ?? 30;
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const today = new Date();
    const toKey = (d: Date) => d.getUTCMonth() * 100 + d.getUTCDate();

    const upcoming = records
      .map((m) => ({ m, bd: ((m as unknown as { birthday?: string }).birthday ?? '').trim() }))
      .filter((r) => /^\d{2}-\d{2}$/.test(r.bd))
      .map((r) => {
        const [mm, dd] = r.bd.split('-').map(Number);
        const month = mm - 1;
        // Days until the next occurrence, ignoring the year entirely.
        let next = Date.UTC(today.getUTCFullYear(), month, dd);
        const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        if (next < todayUTC) next = Date.UTC(today.getUTCFullYear() + 1, month, dd);
        const inDays = Math.round((next - todayUTC) / 86400000);
        return {
          id: r.m.id,
          firstName: r.m.firstName ?? '',
          lastName: r.m.lastName ?? '',
          year: r.m.year ?? '',
          birthday: r.bd,
          inDays,
          isToday: inDays === 0,
          onKey: month * 100 + dd,
        };
      })
      .filter((r) => r.inDays <= window)
      .sort((a, b) => a.inDays - b.inDays || a.onKey - b.onKey)
      .map(({ onKey: _onKey, ...rest }) => rest);

    return { birthdays: upcoming };
  },
});
