import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { logPresenceEvent } from '../lib/presence';

/**
 * Opens the venue check-in session. Admins only.
 *
 * Only one session may be open, so a second call is refused rather than
 * silently opening a rival room that would split the roster. The self-heal at
 * the end exists because "one at a time" is enforced by this code and nothing
 * else: if two admins tap start at the same moment, or a previous write landed
 * without the guard, extra Active rows are closed so the invariant holds for
 * the next read.
 */
export default createEndpoint({
  description: 'Opens the venue check-in session (admins only, one at a time)',
  authenticated: true,
  inputSchema: z.object({ subEventId: z.string().min(1) }),
  outputSchema: z.object({ sessionId: z.string(), startedAt: z.string() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);

    const sub = await zite.subEvents.findOne({ id: input.subEventId });
    if (!sub) throw new Error('That event no longer exists.');
    if (sub.hidden) throw new Error('That event is hidden, so it cannot be used for check-in.');

    const existing = (
      await zite.presenceSessions.findAll({ filters: { status: 'Active' }, limit: 10 })
    ).records;
    if (existing.length) throw new Error('A check-in session is already open. Close it before opening another.');

    const startedAt = new Date().toISOString();
    const created = await zite.presenceSessions.create({
      record: {
        sessionKey: `${sub.id}:${startedAt}`,
        subEvent: sub.id,
        startedBy: me.id,
        startedAt,
        status: 'Active',
      } as never,
    });

    // Re-read rather than closing what we already fetched: that snapshot was
    // empty by the time we got here, and a concurrent tap could have added a
    // rival row in between. Anything Active that is not the session we just
    // made loses.
    const stillActive = (
      await zite.presenceSessions.findAll({ filters: { status: 'Active' }, limit: 10 })
    ).records.filter((s) => s.id !== created.id);
    for (const extra of stillActive) {
      await zite.presenceSessions.update({
        id: extra.id,
        record: { status: 'Ended', endedAt: startedAt, endedBy: me.id } as never,
      });
    }

    await logPresenceEvent({ session: created.id, action: 'Session Opened', at: startedAt, by: me.id });
    return { sessionId: created.id, startedAt };
  },
});