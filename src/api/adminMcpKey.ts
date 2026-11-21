import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/**
 * Making, pausing and deleting MCP keys. The key itself is shown once, when it
 * is made: the database only ever holds its sha256, so nobody (admins included)
 * can read an old key back out of the app.
 */
export default createEndpoint({
  description: 'Create, enable, disable or delete an MCP key (admins)',
  authenticated: true,
  inputSchema: z.object({
    action: z.enum(['create', 'enable', 'disable', 'delete', 'act-as']),
    id: z.string().max(60).optional(),
    name: z.string().max(80).optional(),
    memberId: z.string().max(60).optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    token: z.string().optional(),
    keys: z.array(z.any()),
  }),
  async execute({ context, input }) {
    const me = await requireAdmin(context.user!.email);

    const list = async () => {
      const [r, crew] = await Promise.all([
        zite.mcpKeys.findAll({ limit: 100 }),
        zite.crewMembers.findAll({ limit: 2000 }),
      ]);
      const nameOf = (id: string) => {
        const m = crew.records.find((x) => String(x.id) === id);
        return m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() : '';
      };
      return r.records
        .map((k) => ({
          id: String(k.id),
          name: String(k.name ?? ''),
          prefix: String(k.prefix ?? ''),
          enabled: !!k.enabled,
          memberId: String(k.memberId ?? '') || String(k.createdBy ?? ''),
          actAsMemberId: String(k.actAsMemberId ?? ''),
          actorName: nameOf(String(k.actAsMemberId ?? '') || String(k.memberId ?? '') || String(k.createdBy ?? '')),
          createdAt: String(k.createdAt ?? ''),
          lastUsedAt: String(k.lastUsedAt ?? ''),
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    };

    if (input.action === 'create') {
      const name = (input.name ?? '').trim() || 'MCP key';
      const token = `atc_${randomBytes(24).toString('base64url')}`;
      await zite.mcpKeys.create({
        record: {
          name,
          prefix: token.slice(4, 12),
          tokenHash: createHash('sha256').update(token).digest('hex'),
          enabled: true,
          createdBy: me.id,
          // The key acts as whoever made it, not as a server-wide MCP_EMAIL.
          memberId: me.id,
        },
      });
      return { ok: true, token, keys: await list() };
    }

    if (!input.id) throw new ZiteError({ code: 'BAD_REQUEST', message: 'Which key?', userFacingMessage: 'Pick a key first.' });

    if (input.action === 'delete') {
      await zite.mcpKeys.delete({ id: input.id });
      return { ok: true, keys: await list() };
    }

    if (input.action === 'act-as') {
      // Empty means back to the maker. Checked here so a typo does not silently
      // leave a key acting as the wrong person.
      const wanted = (input.memberId ?? '').trim();
      if (wanted) {
        const crew = await zite.crewMembers.findAll({ filters: { id: wanted }, limit: 1 });
        const m = crew.records[0];
        if (!m) throw new ZiteError({ code: 'NOT_FOUND', message: 'No such member', userFacingMessage: 'That person is not in the crew list.' });
        if (!m.isAdmin && !m.isMaintainer) {
          throw new ZiteError({
            code: 'BAD_REQUEST',
            message: 'Actor must be admin or maintainer',
            userFacingMessage: 'A key can only act as someone with admin or maintainer access, otherwise the tools cannot do their job.',
          });
        }
      }
      await zite.mcpKeys.update({ id: input.id, record: { actAsMemberId: wanted || null } });
      return { ok: true, keys: await list() };
    }

    await zite.mcpKeys.update({ id: input.id, record: { enabled: input.action === 'enable' } });
    return { ok: true, keys: await list() };
  },
});
