import { z } from 'zod';
import { createEndpoint } from '#backend';
import { db } from '#db';

/** A short, human label for a device from its user-agent string. */
function deviceName(ua: string): string {
  const s = ua || '';
  const os = /iPhone|iPad|iPod/i.test(s) ? 'iOS'
    : /Android/i.test(s) ? 'Android'
      : /Mac OS X|Macintosh/i.test(s) ? 'Mac'
        : /Windows/i.test(s) ? 'Windows'
          : /Linux/i.test(s) ? 'Linux' : '';
  const browser = /Edg\//i.test(s) ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
      : /Chrome\//i.test(s) ? 'Chrome'
        : /Firefox\//i.test(s) ? 'Firefox'
          : /Safari\//i.test(s) ? 'Safari' : 'Browser';
  return [browser, os].filter(Boolean).join(' on ') || 'Unknown device';
}

/**
 * The devices this member is signed in on (feedback round 2). Sessions are
 * keyed by their secret id (the cookie), so the UI addresses them by publicId
 * instead; the id itself never leaves the server.
 */
export default createEndpoint({
  description: 'List the devices the caller is signed in on.',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const email = context.user.email;
    const { rows: cur } = await db().query('SELECT "publicId" FROM "AuthSessions" WHERE "id" = $1', [context.user.id]);
    const currentId = cur[0]?.publicId ?? null;
    const { rows } = await db().query(
      `SELECT "publicId", "userAgent", "ip", "createdAt", "lastSeenAt", "expiresAt"
         FROM "AuthSessions"
        WHERE lower("email") = lower($1) AND "expiresAt" > now()
        ORDER BY "lastSeenAt" DESC`,
      [email],
    );
    return {
      current: currentId,
      sessions: rows.map((r: { publicId: string; userAgent: string; ip: string; createdAt: string; lastSeenAt: string; expiresAt: string }) => ({
        id: r.publicId,
        name: deviceName(r.userAgent),
        ip: r.ip,
        createdAt: r.createdAt,
        lastSeenAt: r.lastSeenAt,
        expiresAt: r.expiresAt,
        current: r.publicId === currentId,
      })),
    };
  },
});
