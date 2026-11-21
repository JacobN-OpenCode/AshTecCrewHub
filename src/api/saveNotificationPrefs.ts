import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { NOTIFICATION_KIND_IDS, resolvedNotificationPrefs } from '../lib/notificationKinds';

/**
 * Push tuning (Batch 6): the member's own per-kind switches.
 *
 * Only known kinds are accepted, and each value is coerced to a boolean, so a
 * typo in the client cannot store a junk key that would silently do nothing.
 * Stored as a compact JSON blob in the member's `notificationPrefs` column;
 * an absent key means on, which is why turning everything back on writes `{}`.
 */
export default createEndpoint({
  description: 'Save the member’s per-kind push notification preferences',
  authenticated: true,
  inputSchema: z.object({
    prefs: z.record(z.boolean()),
  }),
  outputSchema: z.object({ ok: z.boolean(), prefs: z.record(z.boolean()) }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const clean: Record<string, boolean> = {};
    for (const kind of NOTIFICATION_KIND_IDS) {
      if (kind in input.prefs) clean[kind] = !!input.prefs[kind];
    }
    const raw = JSON.stringify(clean);
    await zite.crewMembers.update({ id: me.id, record: { notificationPrefs: raw } as never });
    return { ok: true, prefs: resolvedNotificationPrefs(raw) };
  },
});
