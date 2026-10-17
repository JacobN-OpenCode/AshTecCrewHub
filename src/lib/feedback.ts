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

/**
 * A free-form paragraph prompt, used by "freeform" forms instead of tick-box
 * sections. The member writes as much or as little as they like under each one.
 */
export interface FeedbackPrompt {
  id: string;
  label: string;
  hint?: string;
}

export interface FeedbackForm {
  id: string;
  /** Who the invitation is from. Signed by hand. */
  fromName: string;
  fromRole: string;
  title: string;
  intro: string;
  /**
   * 'ideas' (the default) is the tick-box form: `sections` of features plus an
   * optional free-text box. 'freeform' drops the picker entirely and asks for a
   * paragraph under each `prompts` entry.
   */
  kind?: 'ideas' | 'freeform';
  /** Tick-box sections. Present on 'ideas' forms. */
  sections?: FeedbackSection[];
  /** Paragraph prompts. Present on 'freeform' forms. */
  prompts?: FeedbackPrompt[];
  /** The extra free-text box on 'ideas' forms. Optional. */
  otherLabel?: string;
  otherHint?: string;
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
          { id: 'cue-sheets', label: 'Lighting and sound cue sheets stored per show' },
          { id: 'prop-inventory', label: 'Prop & costume inventory tracking', hint: 'Where is the good sword? Who has it?' },
          { id: 'rehearsal-shuffle', label: 'Suggested rehearsal orders that group scenes by who is needed', hint: "So people aren't sat around for three hours to say one line." },
          { id: 'scene-timings', label: 'Estimated scene run-times, learned from real rehearsals', hint: 'So you can see early when a show is running long.' },
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
          { id: 'green-room', label: 'A green room noticeboard for the cast', hint: 'Call times, messages, morale.' },
          { id: 'lost-property', label: 'A lost property log so props and kit always find their way home' },
          { id: 'audience-counts', label: 'A nightly audience headcount, so you can see how a run is selling' },
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
          { id: 'travel-time', label: 'Travel-time padding, so you know when to set off', hint: 'The hub knows the venue, so it can tell you when to leave home.' },
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
          { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts for the power users' },
          { id: 'export-data', label: 'Export my own data as a spreadsheet' },
          { id: 'accessibility', label: 'A bigger-text, higher-contrast mode' },
          { id: 'watch-companion', label: 'A Watch view for show day, so you are not on your phone backstage' },
          { id: 'notification-history', label: 'A notification history, so you can catch up on what you missed' },
          { id: 'widgets', label: 'A home-screen widget showing your next call time' },
          { id: 'call-sheet-packs', label: 'Printable call sheets and show packs' },
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
  '2': {
    id: '2',
    fromName: 'Jacob',
    fromRole: 'Lead Developer',
    title: 'Now help me tidy it up',
    intro:
      "You told me what to build. This one is the other half: what I got wrong. Two boxes - the things that need to change, and the things that should go. Be as blunt as you like, I would much rather hear it than guess.",
    kind: 'freeform',
    prompts: [
      {
        id: 'change',
        label: 'Things that need to change',
        hint: 'Anything broken, confusing, slow, or just not how you would have done it. Small things absolutely count.',
      },
      {
        id: 'remove',
        label: 'Things that should go',
        hint: 'Features, buttons or clutter you would not miss. If it gets in your way, say so.',
      },
    ],
  },
};

export function getFeedbackForm(id: string): FeedbackForm | undefined {
  return FEEDBACK_FORMS[id];
}

/** Every valid feature id in a form, so a submission can be filtered against it. */
export function featureIds(form: FeedbackForm): string[] {
  return (form.sections ?? []).flatMap((s) => s.features.map((f) => f.id));
}

/** Every valid prompt id in a freeform form, for the same reason. */
export function promptIds(form: FeedbackForm): string[] {
  return (form.prompts ?? []).map((p) => p.id);
}
