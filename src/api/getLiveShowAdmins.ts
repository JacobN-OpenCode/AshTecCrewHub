import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { adminsWithSecrets } from '../../server/catLogin.js';

/**
 * The admins a stage screen can be enabled as (ticket f75f7b40). Only admins
 * who actually have a cat-login secret set can be picked, because the enable
 * prompt and the in-page unlock both verify that secret. Returns id and name
 * only: the email was published to anyone who asked, and the endpoints resolve
 * the address from the id instead. No secret material is returned.
 */
export default createEndpoint({
  description: 'Lists admins with a cat-login secret (id and name) for the enable/unlock pickers',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({
    admins: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  execute: async () => {
    const withSecrets = new Set((await adminsWithSecrets()).map((e) => e.toLowerCase()));
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const admins = records
      .filter((m) => !!m.isAdmin && !!m.schoolEmail && withSecrets.has(String(m.schoolEmail).toLowerCase()))
      .map((m) => ({
        id: String(m.id),
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Admin',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { admins };
  },
});
