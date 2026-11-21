/**
 * What to say after pressing "Remind the maintainers".
 *
 * Lives here rather than in lib/support.ts because the two screens that use it
 * are browser code, and support.ts imports the server helpers. One sentence
 * for every outcome beats the old silence when nothing was emailed.
 */
export function remindOutcome(r: {
  emailed: number;
  reminded: number;
  skipped?: string;
}): { kind: 'success' | 'info' | 'error'; text: string } {
  if (r.emailed > 0) {
    return {
      kind: 'success',
      text:
        r.reminded > 1
          ? `Reminded the maintainers about ${r.reminded} tickets (${r.emailed} emailed)`
          : `Reminded the maintainers (${r.emailed} emailed)`,
    };
  }
  if (r.reminded > 0) {
    return { kind: 'error', text: `There ${r.reminded === 1 ? 'is 1 ticket' : `are ${r.reminded} tickets`} to chase, but no maintainer on ${r.reminded === 1 ? 'it' : 'them'} has an email address. Assign someone, or check the crew list.` };
  }
  if (r.skipped === 'closed') return { kind: 'info', text: 'This ticket is already closed, so there is nobody to remind.' };
  if (r.skipped === 'waiting-on-reporter')
    return { kind: 'info', text: 'A maintainer replied last, so this is waiting on the person who raised it, not on a maintainer.' };
  return { kind: 'info', text: 'Nothing here is waiting on a maintainer right now.' };
}
