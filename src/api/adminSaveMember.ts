import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin, findMemberByEmail } from '../lib/server';

export default createEndpoint({
  description: 'Creates, updates or deletes a crew member (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    delete: z.boolean().optional(),
    firstName: z.string().optional(),
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
    const record = {
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      year: input.year || null,
      schoolEmail: email,
      isAdmin: input.isPreview ? false : !!input.isAdmin,
      isMaintainer: input.isPreview ? false : !!input.isMaintainer,
      isPreviewAccount: !!input.isPreview,
      memberType: input.memberType || 'Normal Member',
      roles: input.roles ?? [],
      headOf: input.headOf ?? [],
      preferredRole1: input.preferredRole1 || null,
      preferredRole2: input.preferredRole2 || null,
      adminNotes: input.adminNotes ?? '',
    };
    if (input.id) {
      await zite.crewMembers.update({ id: input.id, record });
      return { id: input.id };
    }
    return { id: (await zite.crewMembers.create({ record: record as never })).id };
  },
});
