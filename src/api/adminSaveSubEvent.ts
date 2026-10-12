import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin, syncAutoAttendance } from '../lib/server';

/** HH:MM in 24h, normalising inputs like "9:00" or "19:30" — server-side
 *  validation that runs again on save so the whole app agrees on the shape. */
const hhmm = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use HH:MM in 24-hour time (e.g. 09:00 or 19:30)')
  .transform((s) => (s.length === 4 ? `0${s}` : s));

/**
 * Ticket 57ce12eb: the dates a repeating event lands on after the first one.
 * Steps forward in whole weeks (7 or 14 days) or calendar months, inclusive of
 * the end date, and stops at 60 instances so a mistyped year cannot create
 * hundreds of rows in one save.
 */
const recurrenceDates = (first: string, rule: string, until: string): string[] => {
  const out: string[] = [];
  const end = new Date(`${until}T00:00:00Z`);
  const cursor = new Date(`${first}T00:00:00Z`);
  if (Number.isNaN(end.getTime()) || Number.isNaN(cursor.getTime())) return out;
  for (let i = 0; i < 60; i += 1) {
    if (rule === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (rule === 'fortnightly') cursor.setUTCDate(cursor.getUTCDate() + 14);
    else if (rule === 'monthly') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else break;
    if (cursor > end) break;
    out.push(cursor.toISOString().slice(0, 10));
  }
  return out;
};

export default createEndpoint({
  description: 'Creates or updates a rehearsal/performance/club session (admins)',
  authenticated: true,
  inputSchema: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    type: z.enum(['Rehearsal', 'Performance', 'Club Session']),
    subtype: z.string(),
    // A club session is the one type with no show, so this is no longer min(1);
    // execute enforces "at least one show" for everything else.
    showIds: z.array(z.string()),
    date: z.string().nullable(),
    dateTbc: z.boolean(),
    description: z.string(),
    meetTime: z.string(),
    // Structured start/end: "HH:MM" 24-hour strings, or null/omitted if the
    // event has no confirmed times yet. The free-text "timings" field has
    // been retired: the calendar, the public calendar and the member UI all
    // read these two columns directly.
    startTime: hhmm.nullish(),
    endTime: hhmm.nullish(),
    thingsToBring: z.string(),
    importance: z.enum(['High', 'Medium', 'Low']),
    dueDate: z.string().nullable(),
    dueUnknown: z.boolean(),
    hidden: z.boolean().optional(),
    // Contractors (ticket 00c0715c): whether the event needs contractors, which
    // ones are invited, and the message they see. When needsContractors is
    // off, both the list and the message are cleared so a stale invite can
    // never linger after an admin unticks the box.
    needsContractors: z.boolean().optional(),
    contractorIds: z.array(z.string()).optional(),
    contractorMessage: z.string().optional(),
    // Ticket 57ce12eb: repeat a club session (or any event) on a schedule. Only
    // applied when creating a new event, since editing one instance of an
    // existing series should not silently multiply it.
    recurrence: z.enum(['none', 'weekly', 'fortnightly', 'monthly']).optional(),
    recurrenceUntil: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context.user.email);
    if (input.type !== 'Club Session' && input.showIds.length === 0) {
      throw new Error('Pick at least one show, or make this a club session.');
    }
    // Both or neither: the calendar feed renders either-or as an all-day
    // block, which is wrong if you only entered one end. Pin the boundary
    // cases so an admin who meant a range cannot quietly save a half-range.
    const start = input.startTime ?? null;
    const end = input.endTime ?? null;
    if ((start == null) !== (end == null)) {
      throw new Error('Give both a start time and an end time, or neither.');
    }
    const record = {
      title: input.title,
      type: input.type,
      subtype: input.subtype || null,
      shows: input.showIds,
      date: input.dateTbc ? null : input.date,
      dateTbc: input.dateTbc,
      description: input.description,
      meetTime: input.meetTime,
      startTime: start,
      endTime: end,
      thingsToBring: input.thingsToBring,
      importance: input.importance,
      responseDueDate: input.dueUnknown ? null : input.dueDate,
      dueDateUnknown: input.dueUnknown,
      hidden: !!input.hidden,
      needsContractors: !!input.needsContractors,
      contractors: input.needsContractors ? (input.contractorIds ?? []) : [],
      contractorMessage: input.needsContractors ? (input.contractorMessage ?? '') : '',
    };
    let id = input.id;
    // Ticket 57ce12eb. A repeating series is only expanded on create: editing a
    // single instance must not quietly rewrite every date in the series.
    const rule = input.recurrence && input.recurrence !== 'none' ? input.recurrence : '';
    if (id) {
      await zite.subEvents.update({ id, record });
    } else {
      const group = rule && record.date && input.recurrenceUntil ? crypto.randomUUID() : '';
      const base = { ...record, recurrenceGroup: group || null, recurrenceRule: rule };
      id = (await zite.subEvents.create({ record: base as never })).id;
      if (group) {
        for (const date of recurrenceDates(record.date as string, rule, input.recurrenceUntil as string)) {
          await zite.subEvents.create({ record: { ...base, date } as never });
        }
      }
    }
    await syncAutoAttendance({ subEventId: id });
    return { id };
  },
});
