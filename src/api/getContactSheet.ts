import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * Ticket 19ffa650: the Settings page offered a "Contact sheet" switch that said
 * your school email was on the contact sheet, and promised you would disappear
 * from it if you turned it off. There was no contact sheet anywhere in the app,
 * so "Where?" was the only sensible reply to it.
 *
 * This is that sheet: everyone who opted in, with the address they agreed to
 * share. It is opt-in per member, so nobody's email appears here unless they
 * turned the switch on themselves, and contractors and preview accounts are
 * left out entirely.
 */
export default createEndpoint({
  description: 'Crew members who chose to share their school email, plus whether you are on it',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });

    const people = records
      .filter((m) => !(m as unknown as { isPreviewAccount?: boolean }).isPreviewAccount)
      .filter((m) => m.memberType !== 'Contractor' && m.memberType !== 'AI Agent')
      .filter((m) => !!(m as unknown as { contactShare?: boolean }).contactShare)
      .filter((m) => !!m.schoolEmail)
      .map((m) => ({
        id: String(m.id),
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || String(m.schoolEmail),
        firstName: m.firstName ?? '',
        year: m.year ?? '',
        roles: (m.headOf ?? []).length ? [...(m.headOf ?? []), ...(m.roles ?? [])] : (m.roles ?? []),
        email: String(m.schoolEmail ?? ''),
        avatarUrl: (m as unknown as { avatarUrl?: string | null }).avatarUrl ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      people,
      // Whether this member is on the sheet, so the page can offer the switch.
      on: people.some((p) => p.id === String(me.id)),
    };
  },
});
