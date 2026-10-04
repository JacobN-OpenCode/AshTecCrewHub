import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { YEARS, ROLES } from '../lib/constants';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Comma-separated list of every address a member may still sign in with. */
const parseAlternates = (raw: string | null | undefined) =>
  (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export default createEndpoint({
  description: 'Lets a member edit their own name, year, school email and preferred roles. Nothing else.',
  authenticated: true,
  inputSchema: z.object({
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    year: z.string().optional(),
    schoolEmail: z.string().max(200).optional(),
    preferredRole1: z.string().optional(),
    preferredRole2: z.string().optional(),
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
    if (p1 && p1 === p2) throw new Error('Pick two different roles.');

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
