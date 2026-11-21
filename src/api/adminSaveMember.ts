import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireAdmin, findMemberByEmail } from '../lib/server';
import { parsePermissionState } from '../lib/permissions';
import { isAvatarUrl, AVATAR_URL_MESSAGE } from '../lib/avatarUrl';

export default createEndpoint({
  description: 'Creates, updates or deletes a crew member (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    delete: z.boolean().optional(),
    // New rule: only a first initial (max 2 characters), never a full name.
    // An AI agent is the exception: it is an account with a name, so the field
    // accepts up to 60 here and the initial rule is enforced for people below.
    firstName: z.string().max(60).optional(),
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
    parentEmail: z.string().max(200).optional(),
    // Ticket 456e6083: selecting "No mentor yet" sends an explicit null. The
    // column is nullable, so null has to be accepted here or saving a member
    // with no mentor was rejected before it reached the database.
    mentorId: z.string().nullable().optional(),
    isMentor: z.boolean().optional(),
    hiddenFromRoster: z.boolean().optional(),
    // Feedback round 2: per-member permission overrides.
    permissions: z.object({ granted: z.array(z.string()), revoked: z.array(z.string()) }).optional(),
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
    const isAgent = input.memberType === 'AI Agent';
    if (!isAgent && input.firstName.trim().length > 2) {
      throw new ZiteError({
        code: 'BAD_REQUEST',
        message: 'FirstNameTooLong',
        userFacingMessage: 'Use a first initial (two letters at most). Only an AI agent account gets a full name.',
      });
    }
    const clash = await findMemberByEmail(email);
    if (clash && clash.id !== input.id) throw new Error('Another member already uses that email.');
    if (input.id === me.id && input.isAdmin === false) throw new Error('You can’t remove your own admin access.');
    const avatarUrl = (input.avatarUrl ?? '').trim();
    // Ticket 76cf803c: a bad picture link is the person's typo, not a server
    // fault. Throwing a plain Error made this a 500 and emailed the maintainers;
    // a BAD_REQUEST says exactly what is wrong and stays out of the error feed.
    // Ticket 3bf93c2e: an uploaded picture is a relative /api/uploads/... path.
    if (avatarUrl && !isAvatarUrl(avatarUrl)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: AVATAR_URL_MESSAGE });
    }
    const record: Record<string, unknown> = {
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
      parentEmail: (input.parentEmail ?? '').trim().toLowerCase().slice(0, 200),
      mentorId: input.mentorId || null,
      isMentor: !!input.isMentor,
      hiddenFromRoster: !!input.hiddenFromRoster,
    };
    if (record.memberType === 'AI Agent') {
      // An agent is an account, not a pupil: no year, roles or register, kept off
      // the roster, and admin so its own keys can call the admin tools.
      record.isAdmin = input.isPreview ? false : true;
      record.isMaintainer = false;
      record.hiddenFromRoster = true;
      record.year = '';
      record.roles = [];
      record.headOf = [];
      record.preferredRole1 = '';
      record.preferredRole2 = '';
      record.mentorId = null;
      record.isMentor = false;
      record.lastName = input.lastName ?? '';
    }
    if (input.permissions !== undefined) {
      record.permissions = JSON.stringify(parsePermissionState(input.permissions));
    }
    if (input.id) {
      await zite.crewMembers.update({ id: input.id, record });
      return { id: input.id };
    }
    return { id: (await zite.crewMembers.create({ record: record as never })).id };
  },
});
