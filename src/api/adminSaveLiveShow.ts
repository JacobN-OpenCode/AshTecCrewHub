import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import { mapLiveShow, isLiveShowStatus } from '../lib/liveShow';

export default createEndpoint({
  description: 'Creates or updates a live show config for a show (admins)',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string(),
    name: z.string().optional(),
    areaName: z.string().optional(),
    status: z.string().optional(),
    open: z.boolean().optional(),
    code: z.string().optional(),
    intermissionMinutes: z.number().optional(),
    currentSceneIndex: z.number().optional(),
    crewCanEdit: z.boolean().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    let liveShow = await zite.liveShows.findOne({ filters: { showId: input.showId } });
    const record: Record<string, unknown> = {};
    if (input.name !== undefined) record.name = input.name;
    if (input.areaName !== undefined) record.areaName = input.areaName;
    if (input.status !== undefined) record.status = isLiveShowStatus(input.status) ? input.status : 'standby';
    if (input.code !== undefined) record.code = input.code;
    if (input.intermissionMinutes !== undefined) record.intermissionMinutes = Math.max(0, Math.floor(input.intermissionMinutes));
    if (input.currentSceneIndex !== undefined) record.currentSceneIndex = Math.max(0, Math.floor(input.currentSceneIndex));
    if (input.crewCanEdit !== undefined) record.crewCanEdit = !!input.crewCanEdit;
    if (input.open !== undefined) record.open = !!input.open;
    record.updatedBy = admin.id;

    if (liveShow) {
      await zite.liveShows.update({ id: liveShow.id, record });
    } else {
      liveShow = await zite.liveShows.create({ record: { showId: input.showId, ...record } });
    }
    if (input.open) {
      // Only one show can be open at a time: opening one closes any other.
      const { records } = await zite.liveShows.findAll({ limit: 100 });
      for (const other of records) {
        if (other.open && other.id !== liveShow.id) await zite.liveShows.update({ id: other.id, record: { open: false } });
      }
    }
    return { liveShow: mapLiveShow(liveShow) };
  },
});