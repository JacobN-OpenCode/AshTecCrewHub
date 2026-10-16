import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids } from '../lib/server';

/** Acknowledge a cue call you received. Only the recipient can do this. */
export default createEndpoint({
  description: 'Acknowledge a cue call',
  authenticated: true,
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const call = await zite.cueCalls.findOne({ id: input.id });
    if (!call) throw new Error('Cue call not found.');
    if (ids(call.member)[0] !== me.id) throw new Error('That cue call is not yours.');
    if (!call.ackedAt) {
      await zite.cueCalls.update({ id: input.id, record: { ackedAt: new Date().toISOString() } });
    }
    return { ok: true };
  },
});
