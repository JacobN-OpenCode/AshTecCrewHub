import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { hasSecret } from '../../server/catLogin.js';

/**
 * Tells the signed-in admin whether they have a cat-login secret set, so the
 * Settings page can show "Set" / "Not set" without exposing other admins'
 * state. Admins only.
 */
export default createEndpoint({
  description: 'Returns whether the signed-in admin has a cat-login secret set',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({ hasSecret: z.boolean() }),
  execute: async ({ context }) => {
    const me = await requireAdmin(context.user.email);
    return { hasSecret: await hasSecret(me.schoolEmail ?? '') };
  },
});
