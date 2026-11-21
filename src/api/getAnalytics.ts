import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';

/**
 * The Club -> Analytics page.
 *
 * Everyone signed in sees the shape of the traffic: how many views, how many
 * separate browsers, which pages, and what kind of device. Admins see the rest:
 * which named crew member was behind a signed-in visit, where people came from,
 * and which utm campaign brought them. That split is the rule the page is built
 * around, so for anyone who is not an admin the four detail lists come back
 * empty rather than being hidden in the browser.
 */

const RANGES = [7, 30, 90];

export default createEndpoint({
  description: 'Site analytics: totals for everyone, detail for admins',
  authenticated: true,
  inputSchema: z.object({ days: z.number().optional() }),
  outputSchema: z.object({
    days: z.number(),
    canSeePeople: z.boolean(),
    totals: z.object({
      views: z.number(),
      visitors: z.number(),
      signedInViews: z.number(),
      members: z.number(),
      perVisit: z.number(),
    }),
    daily: z.array(z.object({ date: z.string(), views: z.number(), visitors: z.number() })),
    pages: z.array(z.object({ path: z.string(), views: z.number(), visitors: z.number() })),
    devices: z.array(z.object({ device: z.string(), views: z.number() })),
    // Admin only, so they are optional rather than always present.
    people: z
      .array(z.object({ id: z.string(), name: z.string(), year: z.string(), views: z.number(), lastSeen: z.string() }))
      .optional(),
    sources: z.array(z.object({ source: z.string(), medium: z.string(), views: z.number(), visitors: z.number() })).optional(),
    campaigns: z.array(z.object({ campaign: z.string(), source: z.string(), views: z.number() })).optional(),
    referrers: z.array(z.object({ host: z.string(), views: z.number(), visitors: z.number() })).optional(),
  }),
  async execute({ input, context }) {
    const me = await requireMember(context.user!.email);
    const days = RANGES.includes(Number(input.days)) ? Number(input.days) : 30;
    const span = `${days} days`;
    const isAdmin = !!me.isAdmin;

    const [totals, daily, pages, devices] = await Promise.all([
      zite.sql({
        query:
          'SELECT count(*)::int AS views, count(DISTINCT "sessionId")::int AS visitors,' +
          ' count(*) FILTER (WHERE "member" IS NOT NULL)::int AS signed_in_views,' +
          ' count(DISTINCT "member")::int AS members' +
          ' FROM "PageViews" WHERE "createdAt" > now() - $1::interval',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT to_char(date_trunc(\'day\', "createdAt"), \'YYYY-MM-DD\') AS day,' +
          ' count(*)::int AS views, count(DISTINCT "sessionId")::int AS visitors' +
          ' FROM "PageViews" WHERE "createdAt" > now() - $1::interval' +
          ' GROUP BY 1 ORDER BY 1',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT "path", count(*)::int AS views, count(DISTINCT "sessionId")::int AS visitors' +
          ' FROM "PageViews" WHERE "createdAt" > now() - $1::interval' +
          ' GROUP BY 1 ORDER BY views DESC LIMIT 15',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT "device", count(*)::int AS views FROM "PageViews"' +
          ' WHERE "createdAt" > now() - $1::interval GROUP BY 1 ORDER BY views DESC',
        params: [span],
      }),
    ]);

    const t = totals.rows[0] ?? { views: 0, visitors: 0, signed_in_views: 0, members: 0 };
    const views = Number(t.views) || 0;
    const visitors = Number(t.visitors) || 0;

    // Fill quiet days with zeros so the chart's x-axis is a real calendar.
    const byDay = new Map<string, { views: number; visitors: number }>();
    for (const row of daily.rows) {
      byDay.set(String(row.day), { views: Number(row.views), visitors: Number(row.visitors) });
    }
    const series: { date: string; views: number; visitors: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const hit = byDay.get(key);
      series.push({ date: key, views: hit?.views ?? 0, visitors: hit?.visitors ?? 0 });
    }

    const base = {
      days,
      canSeePeople: isAdmin,
      totals: {
        views,
        visitors,
        signedInViews: Number(t.signed_in_views) || 0,
        members: Number(t.members) || 0,
        perVisit: visitors ? Math.round((views / visitors) * 10) / 10 : 0,
      },
      daily: series,
      pages: pages.rows.map((r) => ({
        path: String(r.path),
        views: Number(r.views),
        visitors: Number(r.visitors),
      })),
      devices: devices.rows.map((r) => ({
        device: String(r.device || 'unknown'),
        views: Number(r.views),
      })),
    };

    // The four detail lists are simply empty for anyone who is not an admin:
    // the names, campaigns and referring sites never leave the server.
    if (!isAdmin) return { ...base, people: [], sources: [], campaigns: [], referrers: [] };

    const [people, sources, campaigns, referrers] = await Promise.all([
      zite.sql({
        query:
          'SELECT p."member", count(*)::int AS views, max(p."createdAt") AS last_seen,' +
          ' m."firstName", m."lastName", m."year"' +
          ' FROM "PageViews" p LEFT JOIN "CrewMembers" m ON m."id" = p."member"' +
          ' WHERE p."member" IS NOT NULL AND p."createdAt" > now() - $1::interval' +
          ' GROUP BY 1, 4, 5, 6 ORDER BY views DESC LIMIT 60',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT "utmSource" AS source, "utmMedium" AS medium, count(*)::int AS views,' +
          ' count(DISTINCT "sessionId")::int AS visitors FROM "PageViews"' +
          ' WHERE "createdAt" > now() - $1::interval AND "utmSource" <> \'\'' +
          ' GROUP BY 1, 2 ORDER BY views DESC LIMIT 25',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT "utmCampaign" AS campaign, "utmSource" AS source, count(*)::int AS views' +
          ' FROM "PageViews" WHERE "createdAt" > now() - $1::interval' +
          ' AND "utmCampaign" <> \'\' GROUP BY 1, 2 ORDER BY views DESC LIMIT 25',
        params: [span],
      }),
      zite.sql({
        query:
          'SELECT "referrer" AS host, count(*)::int AS views, count(DISTINCT "sessionId")::int AS visitors' +
          ' FROM "PageViews" WHERE "createdAt" > now() - $1::interval AND "referrer" <> \'\'' +
          ' GROUP BY 1 ORDER BY views DESC LIMIT 25',
        params: [span],
      }),
    ]);

    const peopleRows = people.rows.map((r) => ({
      id: String(r.member),
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unknown',
      year: r.year ? String(r.year) : '',
      views: Number(r.views),
      lastSeen: r.last_seen ? String(r.last_seen) : '',
    }));
    const sourceRows = sources.rows.map((r) => ({
      source: String(r.source),
      medium: String(r.medium || ''),
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));
    const campaignRows = campaigns.rows.map((r) => ({
      campaign: String(r.campaign),
      source: String(r.source || ''),
      views: Number(r.views),
    }));
    const referrerRows = referrers.rows.map((r) => ({
      host: String(r.host),
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));

    return { ...base, people: peopleRows, sources: sourceRows, campaigns: campaignRows, referrers: referrerRows };
  },
});
