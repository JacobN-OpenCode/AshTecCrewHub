import { z } from 'zod';
import { createEndpoint } from '#backend';
import { findMemberByEmail } from '../lib/server';
import { verifyAdminSecret, credentialEmail } from '../../server/catLogin.js';

/**
 * Unlock the in-page controls on /show-dash (ticket f75f7b40).
 *
 * A stage screen is not signed in, so the 3x-spacebar shortcut opens a prompt
 * asking for an admin's email and that admin's cat-login secret. This endpoint
 * verifies the pair without minting a session (verifyAdminSecret checks the
 * secret and the admin flag), and returns the admin's name so the panel can
 * show who is in control. Repeating the shortcut lets a second admin join.
 */
export default createEndpoint({
  description: 'Unlock the in-page live show controls with an admin email and cat-login secret',
  authenticated: false,
  inputSchema: z.object({
    email: z.string().email(),
    pin: z.string().min(1).max(200),
  }),
  outputSchema: z.object({
    admin: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  }),
  execute: async ({ input }) => {
    const member = await findMemberByEmail(input.email);
    if (!member?.isAdmin || !(await verifyAdminSecret(input.email, input.pin))) {
      throw new Error('Those admin details are not right.');
    }
    const name = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Admin';
    return { admin: { id: String(member.id), name, email: input.email.trim().toLowerCase() } };
  },
});
