import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, ids, mapShow, mapSubEvent, mapMember } from '../lib/server';
import { mapLiveShow } from '../lib/liveShow';

export default createEndpoint({
  description: 'Loads all members, shows, sub-events and responses for the admin area',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    await requireAdmin(context.user.email);
    const [members, shows, subs, resps, att, live] = await Promise.all([
      zite.crewMembers.findAll({ limit: 2000 }),
      zite.shows.findAll({ limit: 200 }),
      zite.subEvents.findAll({ limit: 2000 }),
      zite.showResponses.findAll({ limit: 2000 }),
      zite.attendance.findAll({ limit: 2000 }),
      zite.liveShows.findAll({ limit: 200 }),
    ]);
    return {
      members: members.records
        .map(mapMember)
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)),
      shows: shows.records.map(mapShow),
      subEvents: subs.records.map(mapSubEvent).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')),
      // Ticket b753f155: the live show setup page has to know which show is on
      // before it can open it, and the shows themselves carry no status.
      liveShows: live.records.map(mapLiveShow).map((l) => ({ showId: l.showId, open: l.open, status: l.status })),
      responses: resps.records.map((r) => ({
        memberId: ids(r.member)[0] ?? '',
        showId: ids(r.show)[0] ?? '',
        response: r.response ?? '',
      })),
      attendance: att.records.map((a) => ({
        memberId: ids(a.member)[0] ?? '',
        subEventId: ids(a.subEvent)[0] ?? '',
        status: a.status ?? '',
        reason: a.reason ?? '',
        enteredByAdmin: !!a.enteredByAdmin,
      })),
    };
  },
});
