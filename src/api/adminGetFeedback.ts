import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { getFeedbackForm } from '../lib/feedback';

/**
 * Every answer to a feedback form, for the admin results view (/admin/feedback).
 * Newest first. The page turns this into the running tally; the raw rows are here
 * so nothing is hidden behind an aggregate.
 */
export default createEndpoint({
  description: 'Lists every answer to a feedback form (admins only)',
  authenticated: true,
  inputSchema: z.object({ form: z.string().min(1).max(40) }),
  outputSchema: z.object({
    exists: z.boolean(),
    formId: z.string(),
    responses: z.array(
      z.object({
        id: z.string(),
        memberName: z.string(),
        memberEmail: z.string(),
        memberId: z.string(),
        selected: z.array(z.string()),
        other: z.string(),
        submittedAt: z.string(),
      }),
    ),
  }),
  execute: async ({ input, context }) => {
    const me = await requireMember(context.user.email);
    if (!me.isAdmin) throw new ZiteError({ code: 'FORBIDDEN', message: 'Admins only.', userFacingMessage: 'Admins only.' });
    const form = getFeedbackForm(input.form);
    if (!form) throw new ZiteError({ code: 'NOT_FOUND', message: 'No such feedback form.' });

    const { records } = await zite.feedbackResponses.findAll({ filters: { form: form.id }, limit: 500 });
    const responses = records
      .map((r) => ({
        id: String(r.id),
        memberName: (r.memberName as string | null) ?? '',
        memberEmail: (r.memberEmail as string | null) ?? '',
        memberId: (r.member as string | null) ?? '',
        selected: (r.selected as string[] | null) ?? [],
        other: (r.other as string | null) ?? '',
        submittedAt: (r.submittedAt as string | null) ?? '',
      }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    return { exists: true, formId: form.id, responses };
  },
});
