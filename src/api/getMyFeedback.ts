import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireMember } from '../lib/server';
import { getFeedbackForm } from '../lib/feedback';

/**
 * The signed-in member's own answer to a feedback form, if they have sent one.
 *
 * The page uses this to decide between showing the form and showing the locked
 * "thanks, this is what you chose" card, so that someone who has already
 * answered cannot be shown an editable form again.
 */
export default createEndpoint({
  description: "Reads the signed-in member's answer to a feedback form, if they have sent one",
  authenticated: true,
  inputSchema: z.object({ form: z.string().min(1).max(40) }),
  outputSchema: z.object({
    exists: z.boolean(),
    responded: z.boolean(),
    selected: z.array(z.string()),
    other: z.string(),
    submittedAt: z.string(),
  }),
  execute: async ({ input, context }) => {
    const form = getFeedbackForm(input.form);
    // An unknown form id is not an error here; the page simply shows "no form".
    if (!form) return { exists: false, responded: false, selected: [], other: '', submittedAt: '' };
    const me = await requireMember(context.user.email);
    const record = await zite.feedbackResponses.findOne({ filters: { form: form.id, member: me.id } });
    if (!record) return { exists: true, responded: false, selected: [], other: '', submittedAt: '' };
    return {
      exists: true,
      responded: true,
      selected: (record.selected as string[] | null) ?? [],
      other: (record.other as string | null) ?? '',
      submittedAt: (record.submittedAt as string | null) ?? '',
    };
  },
});
