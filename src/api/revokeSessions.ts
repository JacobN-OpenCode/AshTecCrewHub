import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';

/**
 * Sign out other devices (feedback round 2): one named device, every other
 * device, or everything including this one. Scoped to the caller's own email,
 * so it can never touch someone else's sessions.
 */
export default createEndpoint({
  description: 'Sign out other devices: one, all-but-this, or everything.',
  authenticated: true,
  inputSchema: z.object({
    scope: z.enum(['one', 'others', 'all']),
    /** Required when scope is 'one'. */
    publicId: z.string().optional(),
  }),
  outputSchema: z.object({ removed: z.number() }),
  execute: async ({ input, context }) => {
    const email = context.user.email;
    let result;
    if (input.scope === 'one') {
      if (!input.publicId) throw new Error('Pick a device.');
      result = await db().query(
        'DELETE FROM "AuthSessions" WHERE "publicId" = $1 AND lower("email") = lower($2)',
        [input.publicId, email],
      );
    } else if (input.scope === 'others') {
      result = await db().query(
        'DELETE FROM "AuthSessions" WHERE lower("email") = lower($1) AND "id" <> $2',
        [email, context.user.id],
      );
    } else {
      result = await db().query('DELETE FROM "AuthSessions" WHERE lower("email") = lower($1)', [email]);
    }
    return { removed: result.rowCount ?? 0 };
  },
});
