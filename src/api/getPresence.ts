import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { actingMember } from '../lib/server';
import { activeSession, findPresence, mapPresence, one } from '../lib/presence';

/**
 * Everything the signed-in member needs to render check-in: whether a session is
 * open, which event it is for, and their own row.
 *
 * Deliberately does not return other people's rows. The roster is an admin view
 * (adminGetPresence) because a member has no business learning who else is in
 * the room.
 */
export default createEndpoint({
  description: 'Returns the open check-in session and the caller’s own presence row',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await actingMember(context.user.email, input.previewAs);
    const session = await activeSession();
    if (!session) return { session: null, me: null };

    const subId = one(session.subEvent);
    const sub = subId ? await zite.subEvents.findOne({ id: subId }) : undefined;
    const mine = await findPresence(session.id, me.id);

    return {
      session: {
        id: session.id,
        title: sub?.title ?? 'Venue session',
        type: sub?.type ?? '',
        date: sub?.date ?? null,
        startedAt: session.startedAt ?? null,
      },
      // The approval code belongs to the member holding the phone, so it comes
      // back while their request is pending: without it their QR would vanish on
      // every reload, right when an admin is walking over to scan it.
      me: mine
        ? { ...mapPresence(mine), approvalToken: mine.pendingAction ? mine.approvalToken ?? null : null }
        : null,
    };
  },
});