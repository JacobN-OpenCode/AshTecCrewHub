import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { hasSecret, writeSecret } from '../../server/catLogin.js';

/**
 * Admins manage their own emergency-sign-in secret from the Settings page.
 *
 * Pass an empty string (or omit) to clear. There are no strength requirements
 * of any kind, by design: this is a creature comfort for being locked out, not
 * a primary auth path, and the spec from the opening ticket says "no
 * password/PIN requirements".
 *
 * The cleartext is hashed server-side before it touches the database so a
 * database leak does not give the attacker the passphrase.
 */
export default createEndpoint({
  description: 'Sets or clears the signed-in admins cat-login secret',
  authenticated: true,
  inputSchema: z.object({ value: z.string().max(200) }),
  outputSchema: z.object({ hasSecret: z.boolean() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);
    const value = (input.value ?? '').trim();
    if (!me.schoolEmail) throw new Error('Your account has no email on file.');
    if (value.length > 0 && value.length < 3) {
      throw new Error('That is too short to be a useful password. Use at least 3 characters.');
    }
    await writeSecret(me.schoolEmail, value);
    return { hasSecret: await hasSecret(me.schoolEmail) };
  },
});
