import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { findMemberByEmail, requireAdmin } from '../lib/server';
import { mapLiveShow, liveShowElapsedMs, isLiveShowStatus } from '../lib/liveShow';
import { verifyAdminSecret, credentialEmail } from '../../server/catLogin.js';

/**
 * Drives the show clock, current scene, status and the share-default movement
 * config (ticket f75f7b40). Reachable two ways: a signed-in admin session, or
 * an admin email + cat-login secret from a stage screen that is not signed in
 * (the old "show code" is gone). Movement edits here are the DEFAULTS new
 * screens copy; they do not retro-change screens that already customised.
 */
export default createEndpoint({
  description: 'Controls the live show clock, current scene, status and movement defaults (admins)',
  authenticated: false,
  inputSchema: z.object({
    liveShowId: z.string(),
    action: z.string(),
    status: z.string().optional(),
    sceneIndex: z.number().optional(),
    movementAlert: z.boolean().optional(),
    movementMessage: z.string().max(400).optional(),
    movementSeconds: z.number().min(2).max(600).optional(),
    movementAdmins: z.array(z.string()).max(50).optional(),
    email: z.string().email().optional(),
    memberId: z.string().optional(),
    secret: z.string().max(200).optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    if (context.user) {
      await requireAdmin(context.user.email);
    } else {
      const email = await credentialEmail(input.email, input.memberId);
      const secret = input.secret ?? '';
      const member = email ? await findMemberByEmail(email) : undefined;
      if (!member?.isAdmin || !secret || !(await verifyAdminSecret(email, secret))) {
        throw new Error('Admins only.');
      }
    }
    const ls = await zite.liveShows.findOne({ id: input.liveShowId });
    if (!ls) throw new Error('Live show not found.');
    const record: Record<string, unknown> = {};
    switch (input.action) {
      case 'start':
        if (ls.timerMode !== 'running') {
          record.timerMode = 'running';
          record.timerStartAt = new Date().toISOString();
        }
        break;
      case 'pause': {
        record.timerMode = 'stopped';
        record.timerElapsedMs = Math.max(0, Math.floor(liveShowElapsedMs(ls)));
        record.timerStartAt = null;
        break;
      }
      case 'reset':
        record.timerMode = 'stopped';
        record.timerElapsedMs = 0;
        record.timerStartAt = null;
        break;
      case 'scene': {
        const { records } = await zite.liveShowScenes.findAll({ filters: { liveShowId: input.liveShowId }, limit: 500 });
        const max = Math.max(0, records.length - 1);
        record.currentSceneIndex = Math.max(0, Math.min(max, Math.floor(input.sceneIndex ?? 0)));
        break;
      }
      case 'status':
        record.status = isLiveShowStatus(input.status) ? input.status : 'standby';
        break;
      case 'movement':
        if (typeof input.movementAlert === 'boolean') record.movementAlert = input.movementAlert;
        if (typeof input.movementMessage === 'string') record.movementMessage = input.movementMessage.slice(0, 400);
        if (typeof input.movementSeconds === 'number') record.movementSeconds = Math.min(600, Math.max(2, Math.floor(input.movementSeconds)));
        if (Array.isArray(input.movementAdmins)) record.movementAdmins = [...new Set(input.movementAdmins)];
        break;
      default:
        throw new Error(`Unknown live show action: ${input.action}`);
    }
    await zite.liveShows.update({ id: ls.id, record });
    const updated = (await zite.liveShows.findOne({ id: ls.id })) ?? ls;
    return { liveShow: mapLiveShow(updated) };
  },
});
