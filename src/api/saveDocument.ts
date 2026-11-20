import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireMember, isStaff } from '../lib/server';

/**
 * Ticket 7958eb6c: adding, editing and removing documents. Admins and staff
 * can do this; the audience choice is what the ticket was mainly about, so a
 * document is either for everyone or for the named people.
 *
 * Only links are stored. Nothing is uploaded, so there is no file to leak or
 * forget about, and the link itself is the thing the crew actually needs.
 */
const cleanUrl = (raw: string) => {
  const url = raw.trim();
  if (!url) throw new ZiteError({
    code: 'BAD_REQUEST', message: 'A document needs a link.',
    userFacingMessage: 'Paste the link to the document.',
  });
  if (!/^https?:\/\//i.test(url)) throw new ZiteError({
    code: 'BAD_REQUEST', message: 'Only http(s) links are accepted.',
    userFacingMessage: 'The link has to start with http:// or https://.',
  });
  return url.slice(0, 1000);
};

export default createEndpoint({
  description: 'Add, edit or remove a document link, and choose who can see it',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    title: z.string().max(160).optional(),
    description: z.string().max(1000).optional(),
    url: z.string().max(1000).optional(),
    category: z.string().max(60).optional(),
    audience: z.enum(['crew', 'members', 'roles']).optional(),
    memberIds: z.array(z.string()).max(400).optional(),
    hidden: z.boolean().optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.any(),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    if (!me.isAdmin && !isStaff(me)) throw new ZiteError({
      code: 'FORBIDDEN', message: 'Staff or admins only.',
      userFacingMessage: 'Only staff and admins can add documents.',
    });

    if (input.remove) {
      if (!input.id) throw new Error('Which document?');
      await zite.documents.delete({ id: input.id });
      return { ok: true, removed: true };
    }

    const title = (input.title ?? '').trim();
    if (!title) throw new ZiteError({
      code: 'BAD_REQUEST', message: 'A document needs a title.',
      userFacingMessage: 'Give the document a name so people know what it is.',
    });

    const audience = input.audience ?? 'crew';
    const memberIds = audience === 'crew' ? [] : (input.memberIds ?? []);
    if (audience !== 'crew' && memberIds.length === 0) throw new ZiteError({
      code: 'BAD_REQUEST', message: 'Choose who can see it.',
      userFacingMessage: 'Pick at least one person, or share it with the whole crew.',
    });

    const row = {
      title: title.slice(0, 160),
      description: (input.description ?? '').trim().slice(0, 1000),
      url: cleanUrl(input.url ?? ''),
      category: (input.category ?? '').trim().slice(0, 60),
      audience,
      memberIds,
      hidden: !!input.hidden,
      ...(input.id ? {} : { createdBy: me.id }),
    };

    if (input.id) {
      await zite.documents.update({ id: input.id, record: row });
      return { ok: true, id: input.id };
    }
    const created = await zite.documents.create({ record: row });
    return { ok: true, id: created?.id };
  },
});
