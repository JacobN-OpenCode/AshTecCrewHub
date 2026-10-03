import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAdmin, ids } from '../lib/server';

/** A plain label for "hand this to the coding agent". Setting it triggers nothing. */
export const OPENCODE_TAG_TYPES = ['Bug Report', 'Feature Request'];

export default createEndpoint({
  description: 'Updates the status, assignment or scratchpad notes of a support ticket, or deletes it (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string(),
    status: z.enum(['Open', 'In Progress', 'Resolved', 'Closed']).optional(),
    adminNotes: z.string().optional(),
    assignedMaintainerIds: z.array(z.string()).optional(),
    referToOpencode: z.boolean().optional(),
    delete: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    if (input.delete) { await zite.supportTickets.delete({ id: input.id }); return { success: true }; }
    const record: Record<string, unknown> = {};
    if (input.status) record.status = input.status;
    if (input.adminNotes !== undefined) record.adminNotes = input.adminNotes;
    if (input.referToOpencode !== undefined) {
      // A label for humans only, so only the types that describe a real piece
      // of work can carry it. Setting it must never dispatch or notify anyone.
      const { records } = await zite.supportTickets.findAll({ limit: 2000 });
      const t = records.find((x) => x.id === input.id);
      if (!t) throw new Error('That ticket no longer exists.');
      if (input.referToOpencode && !OPENCODE_TAG_TYPES.includes(t.type ?? 'General Support')) {
        throw new Error('Only bug reports and feature requests can be referred to opencode.');
      }
      record.referToOpencode = input.referToOpencode;
    }
    if (input.assignedMaintainerIds) {
      const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
      // Maintainers must be admins, and a preview account can never be assigned work.
      for (const mid of input.assignedMaintainerIds) {
        const m = members.find((x) => x.id === mid);
        if (!m) throw new Error('That crew member no longer exists.');
        if (!m.isAdmin || m.isPreviewAccount) throw new Error('Only non-preview admins can be assigned a ticket.');
      }
      record.assignedMaintainers = input.assignedMaintainerIds;
      // A new owner should get a full interval before anyone nags them.
      record.escalatedAt = null;
    }
    await zite.supportTickets.update({ id: input.id, record: record as never });
    return { success: true };
  },
});
