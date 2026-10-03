import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { findMemberByEmail, adminCount } from '../lib/server';

export default createEndpoint({
  description: 'Checks whether an email belongs to a crew member before sign-in',
  inputSchema: z.object({ email: z.string() }),
  outputSchema: z.object({ exists: z.boolean(), firstName: z.string(), setupMode: z.boolean() }),
  execute: async ({ input }) => {
    // Guarded because a request with no body still reaches execute: without
    // this it was a 500 rather than a plain "no such crew account".
    const m = await findMemberByEmail(input.email);
    if (!input.email) return { exists: false, firstName: '', setupMode: false };
    if (m) return { exists: true, firstName: m.firstName ?? '', setupMode: false };
    // No admins yet: let the first person in so they can set things up.
    const setupMode = (await adminCount()) === 0;
    return { exists: false, firstName: '', setupMode };
  },
});
