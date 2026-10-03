import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireMember, isStaff } from '../lib/server';
import { activeSession, memberIdsOf, one } from '../lib/presence';

/**
 * The live view of the room: who is here, who has stepped out, who is on their
 * way back, and who is waiting to be let in or out.
 *
 * Readable by staff as well as admins - a stage manager who is not an admin
 * still needs to know who is in the room - but canManage says who may actually
 * open, close and approve. Every mutating endpoint still guards on isAdmin.
 *
 * Only members with a row for this session appear. The crew list is long and
 * most of it is not in the venue, so listing everyone would bury the four
 * people who are actually present.
 */
export default createEndpoint({
  description: 'Returns the open session, its roster, and whether the caller may manage it',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const canManage = !!me.isAdmin;
    if (!canManage && !isStaff(me)) throw new Error('This roster is available to admins and staff only.');

    // The picker for opening a session. Filtered here rather than in the UI so
    // a TBC date can never be offered: presenceStart rejects it, and picking it
    // just produced an error after the click.
    const subEvents = (await zite.subEvents.findAll({ limit: 2000 })).records
      .filter((s) => !s.hidden && !s.dateTbc)
      .map((s) => ({ id: s.id, title: s.title ?? '', date: s.date ?? null }))
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

    const session = await activeSession();
    if (!session) return { session: null, roster: [], canManage, subEvents };

    const subId = one(session.subEvent);
    const sub = subId ? await zite.subEvents.findOne({ id: subId }) : undefined;
    const rows = (await zite.venuePresence.findAll({ filters: { session: session.id }, limit: 2000 }))
      .records;

    const memberIds = memberIdsOf(rows);
    const members = memberIds.length
      ? (await zite.crewMembers.findAll({ filters: { id: { in: memberIds } }, limit: 2000 })).records
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    const roster = rows.map((r) => {
      const memberId = one(r.member) ?? '';
      const m = byId.get(memberId);
      return {
        id: r.id,
        memberId,
        name: m ? `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.schoolEmail || 'Unknown' : 'Unknown',
        year: m?.year ?? '',
        roles: m?.roles ?? [],
        state: r.state ?? null,
        reasonLabel: r.reasonLabel ?? '',
        reason: r.reason ?? '',
        comingBack: !!r.comingBack,
        expectedBackAt: r.expectedBackAt ?? null,
        signedInAt: r.signedInAt ?? null,
        signedOutAt: r.signedOutAt ?? null,
        pendingAction: r.pendingAction ?? null,
      };
    });

    return {
      session: {
        id: session.id,
        title: sub?.title ?? 'Venue session',
        type: sub?.type ?? '',
        date: sub?.date ?? null,
        startedAt: session.startedAt ?? null,
      },
      roster,
      canManage,
      subEvents,
    };
  },
});