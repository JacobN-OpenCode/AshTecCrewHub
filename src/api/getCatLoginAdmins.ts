import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { adminsWithSecrets } from '../../server/catLogin.js';

/**
 * Public endpoint (no auth): lists the admins who have a cat-login secret set,
 * so the cat-dialog dropdown reflects who can actually sign in. Returns each
 * admin's id and name only — never their email address, which was being handed
 * to anyone who asked; the unlock endpoints resolve the address from the id.
 *
 * Returns the same shape whether one, many or none have a secret, so it cannot
 * be used to distinguish "no admins with the cat enabled" from "no admins".
 */
export default createEndpoint({
  description: 'Returns admins with a cat-login secret (id and name) for the landing-page cat dialog',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({ admins: z.array(z.object({ id: z.string(), name: z.string() })) }),
  execute: async () => {
    const withSecrets = new Set((await adminsWithSecrets()).map((e) => e.toLowerCase()));
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const admins = records
      .filter((m) => !!m.isAdmin && !!m.schoolEmail && withSecrets.has(String(m.schoolEmail).toLowerCase()))
      .map((m) => ({ id: String(m.id), name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Admin' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { admins };
  },
});
