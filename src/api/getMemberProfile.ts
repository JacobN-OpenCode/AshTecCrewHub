import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireMember, mapMember, isStaff } from '../lib/server';
import { parsePrivacy, fieldVisible, parseList } from '../lib/settings';

/**
 * The click-a-person profile card. Any signed-in crew member can open another
 * member's card; what they see obeys that member's privacy choices.
 *
 * Admins are never restricted, a member always sees their own record, and a
 * contractor (external) never sees another person's details at all.
 */
export default createEndpoint({
  description: 'A crew member profile for the click-a-person card, honouring their privacy choices.',
  authenticated: true,
  inputSchema: z.object({ memberId: z.string() }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const viewer = await requireMember(context.user.email);
    const target = await zite.crewMembers.findOne({ id: input.memberId });
    if (!target) throw new ZiteError({ code: 'NOT_FOUND', message: 'No such crew member.' });
    const t = target as unknown as Parameters<typeof mapMember>[0];

    const isSelf = viewer.id === (t as unknown as { id: string }).id;
    // Contractors are external accounts; they get their own record and nothing else.
    if (viewer.memberType === 'Contractor' && !isSelf) {
      throw new ZiteError({ code: 'FORBIDDEN', message: 'This is crew-only.' });
    }

    const privacy = parsePrivacy((t as unknown as { privacy?: unknown }).privacy);
    const v = { id: viewer.id, isAdmin: !!viewer.isAdmin };
    const tid = (t as unknown as { id: string }).id;
    const canAvatar = fieldVisible(privacy, 'avatar', v, tid);
    const canEmail = fieldVisible(privacy, 'email', v, tid);
    const canSkills = fieldVisible(privacy, 'skills', v, tid);

    const base = mapMember(t);
    return {
      member: {
        id: base.id,
        firstName: base.firstName,
        lastName: base.lastName,
        shortUsername: base.shortUsername,
        year: base.year,
        memberType: base.memberType,
        roles: base.roles,
        headOf: base.headOf,
        statusText: base.statusText,
        statusEmoji: base.statusEmoji,
        isAdmin: base.isAdmin,
        isMaintainer: base.isMaintainer,
        isStaff: isStaff(t),
        // Privacy-gated fields come back empty when withheld, with a flag below
        // so the card can say "hidden" rather than look broken.
        avatarUrl: canAvatar ? base.avatarUrl : '',
        email: canEmail ? base.email : '',
        skillsTeach: canSkills ? parseList(base.skillsTeach) : [],
        skillsLearn: canSkills ? parseList(base.skillsLearn) : [],
      },
      hidden: { avatar: !canAvatar, email: !canEmail, skills: !canSkills },
      isSelf,
    };
  },
});
