import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { actingMember, findMemberByEmail, adminCount, mapMember } from '../lib/server';
import { resolvedNotificationPrefs } from '../lib/notificationKinds';

/**
 * A warm little note that glows around the name of people who have really
 * helped out. Keyed by email so accounts keep it without a schema change.
 */
const SPECIAL_NOTES: Record<string, string> = {
  'paicel@ashpupil.co.uk': 'A note from Jacob and opencode: your comments were very nice. Thank you!',
  'moorej@ashpupil.co.uk': 'A note from Jacob and opencode: your reviews were really nice. Thank you!',
  'millsa@ashpupil.co.uk': 'A note from Jacob and opencode: your reviews were really nice. Thank you!',
  'mooref@ashpupil.co.uk': 'A note from Jacob and opencode: thank you for all the help across the reviews and everything else. It means a lot!',
};

export default createEndpoint({
  description: 'Returns the signed-in crew member profile',
  authenticated: true,
  inputSchema: z.object({ previewAs: z.string().optional() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const hasOpenLiveShow = !!(await zite.liveShows.findOne({ filters: { open: true } }));
    const specialNote = SPECIAL_NOTES[context.user.email.toLowerCase()] ?? null;
    // Push tuning (Batch 6): the member's per-kind switches, resolved so the
    // Settings UI reads a plain { kind: boolean } and never has to parse the blob.
    if (input.previewAs) {
      const p = await actingMember(context.user.email, input.previewAs);
      const prefs = (p as unknown as { notificationPrefs?: string }).notificationPrefs;
      return {
        member: { ...mapMember(p), isAdmin: false },
        mentor: null,
        supportAwaiting: 0,
        liveShowActive: hasOpenLiveShow,
        specialNote,
        notificationPrefs: resolvedNotificationPrefs(prefs),
      };
    }
    let m = await findMemberByEmail(context.user.email);
    if (!m && (await adminCount()) === 0) {
      // First ever sign-in becomes the initial admin.
      m = await zite.crewMembers.create({
        record: {
          schoolEmail: context.user.email,
          firstName: context.user.firstName || context.user.email.split('@')[0],
          lastName: context.user.lastName || '',
          isAdmin: true,
          memberType: 'Teacher',
        } as never,
      });
    }
    // The Support tab badge: active tickets whose newest entry isn't a user reply.
    let supportAwaiting = 0;
    if (m?.isAdmin) {
      const { records } = await zite.supportTickets.findAll({ limit: 2000 });
      supportAwaiting = records.filter((t) => ['Open', 'In Progress'].includes(t.status ?? 'Open') && t.lastReplyFrom !== 'User').length;
    }
    const mapped = m ? mapMember(m) : null;
    // Resolve the mentor to a name so Settings can show who to ask, rather
    // than a bare id the member cannot read.
    let mentor: { id: string; firstName: string; lastName: string; email: string } | null = null;
    if (m) {
      const mentorId = (m as unknown as { mentorId?: string | null }).mentorId;
      if (mentorId) {
        const rec = await zite.crewMembers.findOne({ filters: { id: mentorId } });
        if (rec) mentor = { id: rec.id, firstName: rec.firstName ?? '', lastName: rec.lastName ?? '', email: rec.schoolEmail ?? '' };
      }
    }
    const prefs = (m as unknown as { notificationPrefs?: string } | null)?.notificationPrefs;
    return {
      member: mapped,
      mentor,
      supportAwaiting,
      liveShowActive: hasOpenLiveShow,
      specialNote,
      notificationPrefs: resolvedNotificationPrefs(prefs),
    };
  },
});
