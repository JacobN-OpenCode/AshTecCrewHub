import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireMember } from '../lib/server';
import { calendarToken } from '../../server/calendar';

/**
 * A shareable calendar feed for parents: the same per-member events feed, given
 * as a plain (webcal/https) URL a parent can add to their own calendar without
 * an account. Signed with the member's own secret, so it is unguessable.
 */
export default createEndpoint({
  description: 'Shareable family/parents calendar feed URL',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const token = await calendarToken(me.id);
    const base = (process.env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');
    // The public parents feed carries the letter's level of detail; the member
    // feed carries responses. Parents get the public one, but scoped to nothing
    // personal, so we hand them the public .ics.
    return {
      memberUrl: `${base}/calendar.ics?token=${token}`,
      memberWebcal: `${base.replace(/^https?:\/\//, 'webcal://')}/calendar.ics?token=${token}`,
      parentsUrl: `${base}/parents.ics`,
      parentsWebcal: `${base.replace(/^https?:\/\//, 'webcal://')}/parents.ics`,
    };
  },
});
