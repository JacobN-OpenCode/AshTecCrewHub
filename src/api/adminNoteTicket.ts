import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin } from '../lib/server';
import { REPLY_KIND } from '../lib/support';
import { SUPPORT_MESSAGE_MAX } from '../lib/emails';

export default createEndpoint({
  description: 'Adds a private note to a support ticket thread, emailing nobody (admins)',
  authenticated: true,
  inputSchema: z.object({ id: z.string(), message: z.string().min(1).max(SUPPORT_MESSAGE_MAX) }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    await zite.supportReplies.create({
      record: {
        ticket: input.id, author: admin.id, kind: REPLY_KIND.note,
        body: input.message.trim(), recipients: '', sentAt: new Date().toISOString(),
      } as never,
    });
    return { success: true };
  },
});
