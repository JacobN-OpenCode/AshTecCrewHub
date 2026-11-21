import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission } from '../lib/server';

const DEPARTMENTS = ['Lighting', 'Sound', 'AV', 'Stage', 'Other'];

/**
 * Create, edit or delete a lighting/sound cue on a show's cue sheet. Cue sheets
 * are crew-owned working documents: any member can edit, admins can delete.
 */
export default createEndpoint({
  description: 'Add, edit or remove a cue sheet row for a show',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    number: z.string().max(40).optional(),
    department: z.enum(['Lighting', 'Sound', 'AV', 'Stage', 'Other']).optional(),
    scene: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
    standby: z.string().max(200).optional(),
    go: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    position: z.number().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      if (!me.isAdmin) throw new Error('Only admins can delete cues.');
      await zite.showCues.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const clamp = (v: string | undefined, n: number) => (v === undefined ? undefined : v.slice(0, n));

    if (input.id) {
      const existing = await zite.showCues.findOne({ id: input.id });
      if (!existing) throw new Error('Cue not found.');
      const record: Record<string, unknown> = {};
      if (input.number !== undefined) record.number = clamp(input.number, 40);
      if (input.department !== undefined) record.department = DEPARTMENTS.includes(input.department) ? input.department : 'Lighting';
      if (input.scene !== undefined) record.scene = clamp(input.scene, 120);
      if (input.description !== undefined) record.description = clamp(input.description, 500);
      if (input.standby !== undefined) record.standby = clamp(input.standby, 200);
      if (input.go !== undefined) record.go = clamp(input.go, 200);
      if (input.notes !== undefined) record.notes = clamp(input.notes, 1000);
      if (input.position !== undefined) record.position = input.position;
      const saved = await zite.showCues.update({ id: input.id, record });
      return { ok: true, id: String(saved?.id ?? input.id) };
    }

    const description = (input.description ?? '').trim();
    const number = (input.number ?? '').trim();
    if (!description && !number) throw new Error('Give the cue a number or a description.');
    const created = await zite.showCues.create({
      record: {
        show: input.showId,
        number: number.slice(0, 40),
        department: input.department ?? 'Lighting',
        scene: (input.scene ?? '').slice(0, 120),
        description: description.slice(0, 500),
        standby: (input.standby ?? '').slice(0, 200),
        go: (input.go ?? '').slice(0, 200),
        notes: (input.notes ?? '').slice(0, 1000),
        position: input.position ?? 0,
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
