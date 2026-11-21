import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireMember } from '../lib/server';
import { calendarToken } from '../../server/calendar';

/**
 * Ticket ab308aca: the member's subscribe-to-calendar URL. Added to Apple/Google
 * Calendar once, it keeps itself up to date as rehearsals move, unlike the
 * one-off download.
 */
export default createEndpoint({
  description: 'Returns this member’s live calendar feed URL (https and webcal)',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    const token = await calendarToken(me.id);
    const base = (process.env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');
    return {
      url: `${base}/calendar.ics?token=${token}`,
      webcal: `${base.replace(/^https?:\/\//, 'webcal://')}/calendar.ics?token=${token}`,
    };
  },
});
