import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember, ids, isStaff } from '../lib/server';

/**
 * Ticket 7958eb6c: "add links to relevant documents".
 *
 * A document is a link somebody on the crew should be able to find again: the
 * risk assessment, the score, the rehearsal schedule. The important half of the
 * ticket is the second one - the poster picks who can see it - so visibility is
 * worked out here, per member, on every read rather than trusted to the client.
 * Crew and staff can add documents; everyone can read what is meant for them.
 */
export default createEndpoint({
  description: 'Documents you can see, and whether you can add to them',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const canManage = me.isAdmin || isStaff(me);
    const myRoles = ids(me.roles);

    const [docs, members] = await Promise.all([
      zite.documents.findAll({ limit: 500 }),
      zite.crewMembers.findAll({ limit: 2000 }),
    ]);

    const nameOf = new Map(members.records.map((m) => [String(m.id), `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || String(m.schoolEmail ?? '')]));
    const roleOf = new Map(members.records.map((m) => [String(m.id), ids(m.roles)]));

    const visible = (d: (typeof docs.records)[number]) => {
      if (canManage) return true;
      if (d.hidden) return false;
      if ((d.audience ?? 'crew') === 'crew') return true;
      if (d.audience === 'roles') return ids(d.memberIds).some((id) => myRoles.includes(id));
      return ids(d.memberIds).includes(me.id);
    };

    const rows = docs.records
      .filter(visible)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .map((d) => ({
        id: d.id,
        title: d.title ?? '',
        description: d.description ?? '',
        url: d.url ?? '',
        category: d.category ?? '',
        audience: d.audience ?? 'crew',
        // Names rather than ids, so a member can see why a document is theirs
        // without a second call, and so the composer can show who it picked.
        sharedWith: ids(d.memberIds).map((id) => nameOf.get(id)).filter(Boolean),
        sharedWithRoles: d.audience === 'roles' ? ids(d.memberIds).map((id) => roleOf.get(id)).flat().length : 0,
        hidden: !!d.hidden,
        createdByName: nameOf.get(String(d.createdBy ?? '')) ?? '',
        createdAt: d.createdAt ?? null,
      }));

    // The composer needs names to pick from, and only people who can add a
    // document get the list: everyone else has no use for the whole crew.
    const people = canManage
      ? members.records
          .filter((m) => m.memberType !== 'Contractor' && !m.isPreviewAccount)
          .map((m) => ({ id: String(m.id), name: nameOf.get(String(m.id)) || String(m.schoolEmail ?? ''), year: String(m.year ?? '') }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return { canManage, documents: rows, people };
  },
});
