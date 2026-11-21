import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';

/**
 * Ticket 6: "Preset email suffixes for sign in" - people on the crew only ever
 * type the part before the @, so the sign-in box should offer the rest.
 *
 * Unauthenticated by necessity: this is read on the sign-in screen, before
 * anyone is signed in. It is deliberately the smallest possible disclosure -
 * the shared school domains on the crew list, most common first, and nothing
 * about any individual. A domain that belongs to one person only is dropped,
 * so this cannot be used to test whether a given person is on the crew.
 */

/** A domain needs at least one other member on it before it is worth offering. */
const MIN_MEMBERS_PER_DOMAIN = 2;
const MAX_HINTS = 5;

export default createEndpoint({
  description: 'The email domains used on the crew list, for sign-in suffix hints',
  inputSchema: z.object({}),
  outputSchema: z.object({ domains: z.array(z.string()) }),
  execute: async () => {
    try {
      const { rows } = await zite.sql({
        query: `
          SELECT lower(split_part("schoolEmail", '@', 2)) AS "domain", COUNT(*)::int AS "n"
          FROM "CrewMembers"
          WHERE "schoolEmail" LIKE '%@%'
            AND COALESCE("isPreviewAccount", false) = false
          GROUP BY 1
          HAVING COUNT(*) >= $1
          ORDER BY "n" DESC, "domain" ASC
          LIMIT $2
        `,
        params: [MIN_MEMBERS_PER_DOMAIN, MAX_HINTS],
      });
      const domains = (rows as { domain?: string | null }[])
        .map((r) => (r.domain ?? '').trim().toLowerCase())
        .filter((d) => d.includes('.'));
      return { domains };
    } catch {
      // A hint is a convenience. If it cannot be read, sign-in still works.
      return { domains: [] };
    }
  },
});
