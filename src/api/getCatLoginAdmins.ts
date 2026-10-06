import { z } from 'zod';
import { createEndpoint } from '#backend';
import { adminsWithSecrets } from '../../server/catLogin.js';

/**
 * Public endpoint (no auth): lists the admin emails that have a non-empty
 * cat-login secret set, so the cat-dialog dropdown on the landing page
 * reflects who can actually sign in. Returns the same shape whether one,
 * many or none have a secret, so it cannot be used to distinguish "no admins
 * with the cat enabled" from "no admins at all".
 *
 * Admin emails are not sensitive in this codebase: they're the same
 * addresses shown in the crew list, the support tab and the public
 * calendar footer, so revealing them does not expand the attack surface.
 * The actual security is on the password.
 */
export default createEndpoint({
  description: 'Returns admin emails that have a cat-login secret set, for the landing-page cat dialog',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({ admins: z.array(z.string()) }),
  execute: async () => {
    return { admins: await adminsWithSecrets() };
  },
});
