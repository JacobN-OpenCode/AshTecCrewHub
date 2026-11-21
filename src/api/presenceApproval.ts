import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { activeSession, findPresenceByToken, one } from '../lib/presence';

/**
 * What an admin sees after scanning a member's QR.
 *
 * Admin-only even though the token is the secret: the token proves which
 * request is being approved, not who is allowed to approve it. If anyone could
 * approve by guessing a link, a member could approve their own sign-out by
 * screenshotting the code and opening it in a private window.
 */
export default createEndpoint({
  description: 'Returns the pending check-in request behind an approval code (admins only)',
  authenticated: true,
  inputSchema: z.object({ token: z.string().min(1) }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);

    const row = await findPresenceByToken(input.token);
    if (!row || !row.pendingAction) return { status: 'invalid' as const };

    // Scanning a QR is allowed to reach this endpoint before we know whether
    // the scanner is an admin. Return a safe status instead of turning an
    // expected permission/expiry case into a platform 500.
    if (!me.isAdmin) return { status: 'not_admin' as const };

    const session = await activeSession();
    const stale = !session || row.session !== session.id;
    if (stale) return { status: 'closed' as const };


    const subId = one(session.subEvent);
    const sub = subId ? await zite.subEvents.findOne({ id: subId }) : undefined;
    const memberId = one(row.member);
    const member = memberId ? await zite.crewMembers.findOne({ id: memberId }) : undefined;

    return {
      status: 'ready' as const,
      selfApproval: memberId === me.id,
      pendingAction: row.pendingAction ?? '',
      member: {
        id: memberId ?? '',
        name: member ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.schoolEmail : 'Unknown member',
        year: member?.year ?? '',
        roles: member?.roles ?? [],
      },
      reasonLabel: row.reasonLabel ?? '',
      reason: row.reason ?? '',
      comingBack: !!row.comingBack,
      expectedBackAt: row.expectedBackAt ?? null,
      currentState: row.state ?? null,
      session: { id: session.id, title: sub?.title ?? 'Venue session' },
    };
  },
});