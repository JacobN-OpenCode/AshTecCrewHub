/**
 * Feedback forms, shown at /feedback/:formId.
 *
 * The form is data, not markup, so three places agree on the exact same list of
 * options: the page someone fills in, the endpoint that stores the answer, and
 * the admin results view that counts them. An idea is identified by its `id`;
 * anything submitted that is not in the list is dropped on the way in, so a
 * stale tab cannot invent options.
 *
 * The ideas here are mine (a very opinionated cat). Someone can pick as many as
 * they like and add their own note at the bottom.
 */

export interface FeedbackFeature {
  id: string;
  label: string;
  hint?: string;
}

export interface FeedbackSection {
  title: string;
  emoji: string;
  features: FeedbackFeature[];
}

export interface FeedbackForm {
  id: string;
  /** Who the invitation is from. Signed by hand. */
  fromName: string;
  fromRole: string;
  title: string;
  intro: string;
  otherLabel: string;
  otherHint: string;
  sections: FeedbackSection[];
}

export const FEEDBACK_FORMS: Record<string, FeedbackForm> = {
  '1': {
    id: '1',
    fromName: 'Jacob',
    fromRole: 'Lead Developer',
    title: 'Help me build the crew hub you actually want',
    intro:
      "I've been tinkering away on this thing and I've got a notebook full of ideas - but I don't want to guess. Pick as many as you like, add your own at the bottom, and I'll build the ones people actually want.",
    otherLabel: 'Anything else? (totally optional)',
    otherHint:
      "An idea I missed, something that annoys you, a wild dream for the hub. Land it here and I'll read every word.",
    sections: [
      {
        title: 'Backstage & rehearsals',
        emoji: '🎭',
        features: [
          { id: 'checklists', label: 'Show checklists you can tick off', hint: 'Props, costumes, cues - so nothing gets left in the van.' },
          { id: 'rehearsal-calls', label: 'Rehearsal call times with who is needed', hint: 'Tell people when they are called, not just that a rehearsal exists.' },
          { id: 'cue-sheets', label: 'Lighting and sound cue sheets stored per show' },
          { id: 'prop-inventory', label: 'Prop & costume inventory tracking', hint: 'Where is the good sword? Who has it?' },
          { id: 'running-order', label: 'A running order with a live now/next marker' },
          { id: 'opening-countdown', label: 'A countdown to opening night on the home screen' },
          { id: 'rehearsal-notes', label: 'Rehearsal notes and blocking diagrams per scene' },
          { id: 'tech-week', label: 'A Tech Week mode that locks the plan down', hint: 'No more last-minute changes once tech starts.' },
          { id: 'roll-call', label: 'One-tap roll call for who is at rehearsal' },
        ],
      },
      {
        title: 'Show day',
        emoji: '🎬',
        features: [
          { id: 'pre-show-signoff', label: 'A pre-show checklist everyone signs off on' },
          { id: 'cue-calls', label: 'Quick cue calls to specific people', hint: 'A nudge to just the two people who need it.' },
          { id: 'sick-cover', label: 'A "who can cover tonight?" finder for last-minute absences' },
          { id: 'backstage-photos', label: 'Backstage photo albums per show' },
          { id: 'post-show-debrief', label: 'Post-show debrief notes people can add to' },
          { id: 'stage-door', label: 'Stage door check-in for visitors and guests' },
          { id: 'green-room', label: 'A green room noticeboard for the cast', hint: 'Call times, messages, morale.' },
          { id: 'show-timer', label: 'A live show timer, so you know how long you have been on' },
        ],
      },
      {
        title: 'The crew',
        emoji: '🧑‍🔧',
        features: [
          { id: 'announcements', label: 'A crew-wide announcements feed', hint: 'Not just email - somewhere it will actually be seen.' },
          { id: 'dms', label: 'Direct messages between crew members' },
          { id: 'skills-directory', label: 'A "who can teach me this?" skills directory' },
          { id: 'badges', label: 'Badges and achievements for crew milestones' },
          { id: 'hours-leaderboard', label: 'A leaderboard for hours contributed' },
          { id: 'statuses', label: 'Custom statuses people can set', hint: 'e.g. "in the lighting box, do not disturb".' },
          { id: 'birthdays', label: 'Birthday and milestone shout-outs' },
          { id: 'contacts', label: 'An optional contact sheet you choose to share' },
          { id: 'mentors', label: 'Pair new members with a mentor for their first show' },
        ],
      },
      {
        title: 'Scheduling',
        emoji: '🗓️',
        features: [
          { id: 'calendar-export', label: 'One-click export of your commitments to Google/Apple' },
          { id: 'clash-detector', label: 'A clash detector', hint: 'Warn me if I am down for two things at once.' },
          { id: 'term-overview', label: 'A term-at-a-glance view with exam blackout dates' },
          { id: 'rota-signup', label: 'Self sign-up rotas for front-of-house and stewarding' },
          { id: 'availability', label: 'Tell the hub when you are not free, once' },
          { id: 'reminders-fine', label: 'Reminders you can tune per event type' },
          { id: 'ics-parents', label: 'A shareable calendar feed for parents' },
        ],
      },
      {
        title: 'The app itself',
        emoji: '🛠️',
        features: [
          { id: 'offline', label: 'Offline mode that works in the wings with no signal' },
          { id: 'push-tuning', label: 'Fine-grained push notification controls' },
          { id: 'search-everything', label: 'Search across everything, not just events', hint: 'Shows, crew, notes, files, all of it.' },
          { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts for the power users' },
          { id: 'export-data', label: 'Export my own data as a spreadsheet' },
          { id: 'accessibility', label: 'A bigger-text, higher-contrast mode' },
          { id: 'feedback-button', label: 'A feedback button on every page' },
          { id: 'install-prompt', label: 'A nicer "add to home screen" nudge' },
          { id: 'themes', label: 'More themes and accent colours' },
        ],
      },
      {
        title: 'A bit of fun',
        emoji: '😺',
        features: [
          { id: 'more-cat', label: 'More of the cat', hint: 'The cat has budget for a bigger role. Just saying.' },
          { id: 'sound-effects', label: 'Silly sound effects (with a mute button, promise)' },
          { id: 'show-memories', label: 'A "show memories" wall at the end of every run' },
          { id: 'mascot', label: 'A crew mascot with a name and a backstory' },
        ],
      },
    ],
  },
};

export function getFeedbackForm(id: string): FeedbackForm | undefined {
  return FEEDBACK_FORMS[id];
}

/** Every valid feature id in a form, so a submission can be filtered against it. */
export function featureIds(form: FeedbackForm): string[] {
  return form.sections.flatMap((s) => s.features.map((f) => f.id));
}
