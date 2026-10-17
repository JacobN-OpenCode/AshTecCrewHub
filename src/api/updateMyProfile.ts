import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { YEARS, ROLES } from '../lib/constants';
import { parsePrivacy, onlyKnownSkills } from '../lib/settings';
import { readAppSettings } from './getSettings';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma-separated list of every address a member may still sign in with. */
const parseAlternates = (raw: string | null | undefined) =>
  (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/**
 * Skills are a controlled list now (feedback round 2): the member picks from the
 * options an admin curates, so we keep only the values that are still real
 * options, tidied and de-duplicated.
 */
const parseTags = (raw: string[], options: string[]) =>
  onlyKnownSkills(
    [...new Set(raw.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean))],
    options,
  ).slice(0, 20).join(', ');

export default createEndpoint({
  description: 'Lets a member edit their own name, year, school email and preferred roles. Nothing else.',
  authenticated: true,
  inputSchema: z.object({
    // New rule: only a first initial (max 2 characters) is stored, never a full
    // first name.
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    year: z.string().optional(),
    schoolEmail: z.string().max(200).optional(),
    preferredRole1: z.string().optional(),
    preferredRole2: z.string().optional(),
    // Profile picture as a link, not an upload: we do not host images. Empty
    // clears it back to the initial-letter fallback.
    avatarUrl: z.string().max(500).optional(),
    statusText: z.string().max(120).optional(),
    statusEmoji: z.string().max(4).optional(),
    birthday: z.string().max(5).optional(),
    contactShare: z.boolean().optional(),
    contactPhone: z.string().max(20).optional(),
    // Skills: the member picks from the admin-curated options, so these are
    // lists of chosen labels, not free text.
    skillsTeach: z.array(z.string()).max(40).optional(),
    skillsLearn: z.array(z.string()).max(40).optional(),
    // Privacy (feedback round 2): what this member hides, and from whom.
    privacy: z.object({
      avatar: z.enum(['crew', 'admins', 'none']).optional(),
      email: z.enum(['crew', 'admins', 'none']).optional(),
      skills: z.enum(['crew', 'admins', 'none']).optional(),
      blocked: z.array(z.string()).max(200).optional(),
    }).optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), emailChanged: z.boolean() }),
  execute: async ({ input, context }) => {
    // requireMember, not actingMember: a preview session must never write.
    const me = await requireMember(context.user.email);
    const record: Record<string, unknown> = {};

    if (input.firstName !== undefined) record.firstName = input.firstName.trim();
    if (input.lastName !== undefined) record.lastName = input.lastName.trim();
    if (input.year !== undefined) {
      if (!YEARS.includes(input.year)) throw new Error('Pick a year from the list.');
      // Staff sits in the same list as the year groups, so without this a
      // member could hand themselves staff standing and change how the app
      // sorts and filters them. Only a crew admin can set it.
      if (input.year === 'Staff') throw new Error('Staff is set by a crew admin - ask one to change it.');
      record.year = input.year;
    }
    if (input.preferredRole1 !== undefined) {
      if (input.preferredRole1 && !ROLES.includes(input.preferredRole1)) throw new Error('Pick a role from the list.');
      record.preferredRole1 = input.preferredRole1 || null;
    }
    if (input.preferredRole2 !== undefined) {
      if (input.preferredRole2 && !ROLES.includes(input.preferredRole2)) throw new Error('Pick a role from the list.');
      record.preferredRole2 = input.preferredRole2 || null;
    }
    const p1 = (input.preferredRole1 ?? me.preferredRole1 ?? '') as string;
    const p2 = (input.preferredRole2 ?? me.preferredRole2 ?? '') as string;
    // Ticket 2070a91c: admins are not required to set stage roles (the form
    // hides the pickers for them), so an admin whose stored roles happen to be
    // equal was blocked from saving anything. The two-distinct-roles rule only
    // applies to people who actually choose roles.
    if (!me.isAdmin && p1 && p1 === p2) throw new Error('Pick two different roles.');

    if (input.avatarUrl !== undefined) {
      const url = input.avatarUrl.trim();
      // Ticket 76cf803c: a mistyped picture link is a 400, not a 500. It used to
      // read as "the crew hub broke" and paged the maintainers over a typo.
      if (!url) record.avatarUrl = '';
      else if (!/^https?:\/\//i.test(url)) throw new ZiteError({ code: 'BAD_REQUEST', message: 'The picture must be a link starting with http:// or https://.' });
      else if (/\s/.test(url)) throw new ZiteError({ code: 'BAD_REQUEST', message: 'That picture link has a space in it - check it is one clean URL.' });
      else record.avatarUrl = url;
    }
    if (input.statusText !== undefined) record.statusText = input.statusText.trim().slice(0, 120);
    if (input.statusEmoji !== undefined) record.statusEmoji = input.statusEmoji.trim().slice(0, 4);
    if (input.birthday !== undefined) {
      const b = input.birthday.trim();
      if (b && !/^(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/.test(b)) throw new Error('Birthday should be MM-DD.');
      record.birthday = b;
    }
    if (input.contactShare !== undefined) record.contactShare = !!input.contactShare;
    if (input.contactPhone !== undefined) record.contactPhone = input.contactPhone.trim().slice(0, 20);

    // Skills are admin-curated now. If an admin has turned member editing off,
    // only an admin may change them; otherwise keep the chosen labels that are
    // still real options.
    if (input.skillsTeach !== undefined || input.skillsLearn !== undefined) {
      const settings = await readAppSettings();
      if (!settings.skillsEditable && !me.isAdmin) {
        throw new ZiteError({ code: 'FORBIDDEN', message: 'Skills are managed by a crew admin.' });
      }
      if (input.skillsTeach !== undefined) record.skillsTeach = parseTags(input.skillsTeach, settings.skillOptions);
      if (input.skillsLearn !== undefined) record.skillsLearn = parseTags(input.skillsLearn, settings.skillOptions);
    }

    if (input.privacy !== undefined) {
      // Merge over the stored blob so a partial update never wipes the rest.
      const current = parsePrivacy((me as unknown as { privacy?: unknown }).privacy);
      const next = parsePrivacy({
        avatar: input.privacy.avatar ?? current.avatar,
        email: input.privacy.email ?? current.email,
        skills: input.privacy.skills ?? current.skills,
        blocked: input.privacy.blocked ?? current.blocked,
      });
      // Nobody can hide from themselves; drop the caller's own id from the list.
      next.blocked = next.blocked.filter((id) => id !== me.id);
      record.privacy = JSON.stringify(next);
    }

    let emailChanged = false;
    if (input.schoolEmail !== undefined) {
      const next = input.schoolEmail.trim().toLowerCase();
      if (!EMAIL.test(next)) throw new Error('That does not look like a valid email address.');
      const current = (me.schoolEmail ?? '').toLowerCase();
      if (next !== current) {
        // Refuse to take an address that already belongs to somebody else,
        // primary or alternate, or two people end up sharing one sign-in.
        const { rows } = await zite.sql({
          query:
            'SELECT "id" FROM "CrewMembers" WHERE "id" <> $2 AND (' +
            'lower("schoolEmail") = lower($1) OR EXISTS (SELECT 1 FROM unnest(string_to_array(COALESCE("alternateEmails", \'\'), \',\')) AS alt WHERE lower(btrim(alt)) = lower($1)))' +
            ') LIMIT 1',
          params: [next, me.id],
        });
        if (rows[0]?.id) throw new Error('That email is already used by another crew member.');
        // Keep the old address working so a typo can never lock anyone out.
        const alternates = [...new Set([...parseAlternates(me.alternateEmails), current].filter(Boolean))];
        record.alternateEmails = alternates.join(',');
        record.schoolEmail = next;
        emailChanged = true;
      }
    }

    await zite.crewMembers.update({ id: me.id, record: record as never });
    return { success: true, emailChanged };
  },
});
