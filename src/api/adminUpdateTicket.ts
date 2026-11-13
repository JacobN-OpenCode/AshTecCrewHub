import { z } from 'zod';
import { OPENCODE_TAG_TYPES } from '../lib/supportStyle';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids } from '../lib/server';
import { REPLY_KIND, fullName } from '../lib/support';

/** A plain label for "hand this to the coding agent". Setting it triggers nothing. */

export default createEndpoint({
  description: 'Updates the status, assignment or scratchpad notes of a support ticket, or deletes it (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string(),
    status: z.enum(['Open', 'In Progress', 'Resolved', 'Closed']).optional(),
    severity: z.enum(['', 'Low', 'Medium', 'High', 'Urgent']).optional(),
    adminNotes: z.string().optional(),
    assignedMaintainerIds: z.array(z.string()).optional(),
    referToOpencode: z.boolean().optional(),
    pinned: z.boolean().optional(),
    delete: z.boolean().optional(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    if (input.delete) { await zite.supportTickets.delete({ id: input.id }); return { success: true }; }
    // Ticket 817c47e9: "Ticket status changed by who and when". Read the row
    // before the update so the change can be described in the thread.
    const before = await zite.supportTickets.findOne({ filters: { id: input.id } });
    const record: Record<string, unknown> = {};
    if (input.status) record.status = input.status;
    if (input.severity !== undefined) record.severity = input.severity;
    // Ticket 636bde75: pin a ticket so it floats to the top of the list.
    if (input.pinned !== undefined) record.pinned = input.pinned;
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

    // Ticket 817c47e9: leave a trail. Each change becomes an internal note, so
    // the thread answers "who moved this, and when" without a new table. Notes
    // are excluded from reply counts and from the maintainer-turn rules, so this
    // cannot disturb the escalation logic.
    const changes: string[] = [];
    if (input.status && before && (before.status ?? 'Open') !== input.status) {
      changes.push(`status ${before.status ?? 'Open'} → ${input.status}`);
    }
    if (input.severity !== undefined && before && (before.severity ?? '') !== input.severity) {
      changes.push(`severity ${before.severity || 'none'} → ${input.severity || 'none'}`);
    }
    if (input.assignedMaintainerIds && before) {
      const was = ids(before.assignedMaintainers).slice().sort().join(',');
      const now = input.assignedMaintainerIds.slice().sort().join(',');
      if (was !== now) {
        const { records: people } = await zite.crewMembers.findAll({ limit: 2000 });
        const nameOf = new Map(people.map((m) => [m.id, fullName(m) || 'someone']));
        const names = input.assignedMaintainerIds.map((id) => nameOf.get(id) ?? 'someone');
        changes.push(names.length ? `assigned to ${names.join(', ')}` : 'unassigned');
      }
    }
    if (changes.length) {
      await zite.supportReplies.create({
        record: {
          ticket: input.id, author: admin.id, kind: REPLY_KIND.note,
          body: `${fullName(admin) || 'An admin'} changed ${changes.join('; ')}.`,
          recipients: '', sentAt: new Date().toISOString(),
        } as never,
      });
    }
    return { success: true };
  },
});
