import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, findMemberByEmail } from '../lib/server';

export default createEndpoint({
  description: 'Creates, updates or deletes a crew member (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    delete: z.boolean().optional(),
    // New rule: only a first initial (max 2 characters), never a full name.
    firstName: z.string().max(2).optional(),
    lastName: z.string().optional(),
    year: z.string().optional(),
    email: z.string().optional(),
    isAdmin: z.boolean().optional(),
    memberType: z.string().optional(),
    roles: z.array(z.string()).optional(),
    headOf: z.array(z.string()).optional(),
    preferredRole1: z.string().optional(),
    preferredRole2: z.string().optional(),
    adminNotes: z.string().optional(),
    isMaintainer: z.boolean().optional(),
    isPreview: z.boolean().optional(),
    avatarUrl: z.string().max(500).optional(),
    statusText: z.string().max(120).optional(),
    statusEmoji: z.string().max(4).optional(),
    birthday: z.string().max(5).optional(),
    contactShare: z.boolean().optional(),
    contactPhone: z.string().max(20).optional(),
    mentorId: z.string().optional(),
    isMentor: z.boolean().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);
    if (input.delete && input.id) {
      if (input.id === me.id) throw new Error('You can’t delete yourself.');
      await zite.crewMembers.delete({ id: input.id });
      return { id: input.id };
    }
    let email = (input.email ?? '').trim().toLowerCase();
    if (input.isPreview && !email) email = `preview-${Math.random().toString(36).slice(2, 8)}@preview.ashtec`;
    if (!email || !input.firstName) throw new Error('First name and school email are required.');
    const clash = await findMemberByEmail(email);
    if (clash && clash.id !== input.id) throw new Error('Another member already uses that email.');
    if (input.id === me.id && input.isAdmin === false) throw new Error('You can’t remove your own admin access.');
    const avatarUrl = (input.avatarUrl ?? '').trim();
    if (avatarUrl && (!/^https?:\/\//i.test(avatarUrl) || /\s/.test(avatarUrl))) {
      throw new Error('Profile picture URL must start with http:// or https://.');
    }
    const record = {
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      // year is NOT NULL DEFAULT '' in the schema, so an unset year must be ''
      // rather than null: writing null here made "add member" 500 whenever no
      // year was chosen.
      year: input.year || '',
      schoolEmail: email,
      isAdmin: input.isPreview ? false : !!input.isAdmin,
      isMaintainer: input.isPreview ? false : !!input.isMaintainer,
      isPreviewAccount: !!input.isPreview,
      memberType: input.memberType || 'Normal Member',
      roles: input.roles ?? [],
      headOf: input.headOf ?? [],
      // Same NOT NULL DEFAULT '' rule as `year`: writing null here made saving
      // a member with no preferred roles fail.
      preferredRole1: input.preferredRole1 || '',
      preferredRole2: input.preferredRole2 || '',
      adminNotes: input.adminNotes ?? '',
      avatarUrl,
      statusText: (input.statusText ?? '').trim().slice(0, 120),
      statusEmoji: (input.statusEmoji ?? '').trim().slice(0, 4),
      birthday: (input.birthday ?? '').trim(),
      contactShare: !!input.contactShare,
      contactPhone: (input.contactPhone ?? '').trim().slice(0, 20),
      mentorId: input.mentorId || null,
      isMentor: !!input.isMentor,
    };
    if (input.id) {
      await zite.crewMembers.update({ id: input.id, record });
      return { id: input.id };
    }
    return { id: (await zite.crewMembers.create({ record: record as never })).id };
  },
});
