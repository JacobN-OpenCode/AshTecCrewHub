import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { Email } from '#email';
import { requireMember, isEmailable } from '../lib/server';
import { getFeedbackForm, featureIds, type FeedbackForm } from '../lib/feedback';
import { noReplyNotice } from '../lib/emails';
import { notifyFeedbackResponse } from '../../server/notify';

/** A tidy, readable list of what they picked, grouped by section. */
function summarise(form: FeedbackForm, selected: string[]): string {
  const chosen = new Set(selected);
  const lines: string[] = [];
  for (const section of form.sections) {
    const hits = section.features.filter((f) => chosen.has(f.id));
    if (!hits.length) continue;
    lines.push(`**${section.emoji} ${section.title}**`);
    for (const f of hits) lines.push(`- ${f.label}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * Stores a member's answer to a feedback form. One answer per form, deliberately
 * final: a second submission is refused with CONFLICT, and the unique index on
 * (form, member) is the backstop if two tabs race.
 */
export default createEndpoint({
  description: 'Stores a member\'s answer to a feedback form (once only) and tells the admins',
  authenticated: true,
  inputSchema: z.object({
    form: z.string().min(1).max(40),
    selected: z.array(z.string().min(1).max(64)).max(200).default([]),
    other: z.string().max(4000).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string(), selectedCount: z.number(), notified: z.number() }),
  execute: async ({ input, context }) => {
    const form = getFeedbackForm(input.form);
    if (!form) throw new ZiteError({ code: 'NOT_FOUND', message: 'That feedback form does not exist.', userFacingMessage: 'That feedback form does not exist.' });

    const me = await requireMember(context.user.email);
    const who = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim() || me.schoolEmail || 'A crew member';

    const existing = await zite.feedbackResponses.findOne({ filters: { form: form.id, member: me.id } });
    if (existing) {
      throw new ZiteError({ code: 'CONFLICT', message: 'Feedback already submitted', userFacingMessage: 'You have already sent your feedback for this. It is locked in - thank you!' });
    }

    // Keep only ids we recognise, de-duplicated, so a stale page cannot smuggle
    // invented options into the results.
    const known = new Set(featureIds(form));
    const selected = [...new Set(input.selected)].filter((id) => known.has(id));
    const other = (input.other ?? '').trim();
    if (!selected.length && !other) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'Empty feedback', userFacingMessage: 'Pick at least one idea, or write something in the box.' });
    }

    let record: Record<string, unknown>;
    try {
      record = await zite.feedbackResponses.create({
        record: {
          form: form.id,
          member: me.id,
          memberEmail: me.schoolEmail ?? '',
          memberName: who,
          selected,
          other,
          submittedAt: new Date().toISOString(),
        } as never,
      });
    } catch (e: unknown) {
      // 23505 = unique_violation, i.e. the (form, member) index caught a race.
      if ((e as { code?: string })?.code === '23505') {
        throw new ZiteError({ code: 'CONFLICT', message: 'Feedback already submitted', userFacingMessage: 'You have already sent your feedback for this. It is locked in - thank you!' });
      }
      throw e;
    }

    // Work out the audience now (a quick read), then let mail and the push go
    // out in the background so "Send" is not held up by an inbox.
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const recipients = records.filter((m) => m.isAdmin && isEmailable(m) && m.adminNotifications !== false && m.id !== me.id);

    void (async () => {
      if (!recipients.length) return;
      const subject = `[Feedback] ${who} answered the "what should I build" form`;
      const body =
        `**${who}** (${me.schoolEmail}) just answered the feedback form **${form.title}**.\n\n` +
        (selected.length ? `${summarise(form, selected)}\n\n` : '') +
        (other ? `**Their own words:**\n\n> ${other.split('\n').join('\n> ')}\n\n` : '') +
        `---\n\nSee everyone's answers and the running tally in the **Feedback** tab.\n\n` +
        noReplyNotice(who, me.schoolEmail ?? '');
      const logs: Record<string, unknown>[] = [];
      await Promise.all(
        recipients.map(async (r) => {
          try {
            await Email.send({
              to: r.schoolEmail,
              subject,
              body: [{ type: 'text', content: body }, { type: 'button', label: 'See the feedback', href: `${process.env.APP_URL}/admin/feedback` }],
            });
            logs.push({ subject, member: r.id, recipientEmail: r.schoolEmail, purpose: 'Feedback', body, sentBy: who, sentAt: new Date().toISOString(), batchId: '' });
          } catch { /* keep going */ }
        }),
      );
      if (logs.length) await zite.emailLog.bulkCreate({ records: logs as never }).catch(() => {});
      await notifyFeedbackResponse({ memberId: me.id, form: form.id, selectedCount: selected.length });
    })();

    return { ok: true, id: String(record.id), selectedCount: selected.length, notified: recipients.length };
  },
});
