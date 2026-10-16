import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';
import { requireMember, mapMember } from '../lib/server';

/**
 * Everything the hub holds about the signed-in member, in one download
 * (Batch 6: export data). Scoped to the caller - staff and admins can already
 * see each of these views, but this is the member's own copy.
 *
 * Returns structured rows rather than a pre-built file so the client can shape
 * it (CSV today, anything else later) without the server caring.
 */
export default createEndpoint({
  description: 'Export the signed-in member’s own data (profile, responses, attendance, tickets, availability, rotas)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);

    const [responses, attendance, tickets, availability, rotas] = await Promise.all([
      db().query(
        `SELECT s."showName" AS show, r."response", r."updatedAt"
           FROM "ShowResponses" r LEFT JOIN "Shows" s ON s."id" = r."show"
          WHERE r."member" = $1 ORDER BY r."updatedAt" DESC`,
        [me.id]
      ),
      db().query(
        `SELECT e."title" AS event, e."date", a."status", a."reason", a."updatedAt"
           FROM "Attendance" a LEFT JOIN "SubEvents" e ON e."id" = a."subEvent"
          WHERE a."member" = $1 ORDER BY a."updatedAt" DESC`,
        [me.id]
      ),
      db().query(
        `SELECT "subject", "type", "status", "message", "submittedAt"
           FROM "SupportTickets" WHERE "submittedBy" = $1 ORDER BY "submittedAt" DESC NULLS LAST`,
        [me.id]
      ),
      db().query(
        `SELECT "date", "allDay", "fromTime", "toTime", "reason"
           FROM "MemberAvailability" WHERE "member" = $1 ORDER BY "date"`,
        [me.id]
      ),
      db().query(
        `SELECT e."title" AS event, e."date", rs."role", r."createdAt" AS signedUpAt
           FROM "RotaSignups" r
           JOIN "RotaSlots" rs ON rs."id" = r."slot"
           LEFT JOIN "SubEvents" e ON e."id" = rs."subEvent"
          WHERE r."member" = $1 ORDER BY r."createdAt" DESC`,
        [me.id]
      ),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: mapMember(me),
      showResponses: responses.rows.map((r) => ({ show: r.show ?? '', response: r.response ?? '', updatedAt: r.updatedAt ?? null })),
      attendance: attendance.rows.map((r) => ({ event: r.event ?? '', date: r.date ?? '', status: r.status ?? '', reason: r.reason ?? '', updatedAt: r.updatedAt ?? null })),
      tickets: tickets.rows.map((r) => ({ subject: r.subject ?? '', type: r.type ?? '', status: r.status ?? '', message: r.message ?? '', submittedAt: r.submittedAt ?? null })),
      availability: availability.rows.map((r) => ({ date: r.date ?? '', allDay: !!r.allDay, fromTime: r.fromTime ?? '', toTime: r.toTime ?? '', reason: r.reason ?? '' })),
      rotaSignups: rotas.rows.map((r) => ({ event: r.event ?? '', date: r.date ?? '', role: r.role ?? '', signedUpAt: r.signedUpAt ?? null })),
    };
  },
});
