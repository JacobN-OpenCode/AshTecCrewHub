import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids } from '../lib/server';

export default createEndpoint({
  description: 'Lists all logged emails, newest first (admins)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);
    const { records } = await zite.emailLog.findAll({ limit: 2000 });
    return {
      emails: records
        .map((e) => ({
          id: e.id,
          subject: e.subject ?? '',
          memberId: ids(e.member)[0] ?? '',
          recipient: e.recipientEmail ?? '',
          purpose: e.purpose ?? '',
          showIds: ids(e.shows),
          body: e.body ?? '',
          sentBy: e.sentBy ?? '',
          // Rows written before sentAt was filled in had a NULL there. Fall back
          // to createdAt so they still sort and render as real dates instead of
          // sinking to the bottom of the list as "Invalid Date".
          sentAt: e.sentAt || e.createdAt || '',
          createdAt: e.createdAt ?? '',
          batchId: e.batchId ?? '',
        }))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    };
  },
});
