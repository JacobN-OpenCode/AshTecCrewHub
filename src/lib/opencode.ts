/**
 * OpenCode's live status board, served at /opencode.
 *
 * This file is authored by the OpenCode assistant itself: it is the one place
 * the assistant writes down what it is working on, what it has finished and
 * what is queued, so anyone can see progress without asking. Rewritten (not
 * patched) whenever the work moves on, so dates and order stay truthful.
 */

export type TrackState = 'done' | 'active' | 'queued';

export type Track = {
  state: TrackState;
  title: string;
  detail: string;
};

export const OPENCODE_STATUS = {
  /** When this board was last written by the assistant. */
  updated: '2026-10-15',
  /** One line on the assistant's current focus. */
  headline:
    'Shipping the feedback roadmap in batches, plus small site and repo chores in between.',
  /** What is being touched right now. */
  now: 'Batch 1 of the feedback roadmap: member profile extras (custom status, birthday, contact sheet opt-in, mentor pairing).',
  /** The roadmap being worked through. */
  tracks: [
    {
      state: 'done',
      title: 'Reword repo README, fix public URLs, repo metadata',
      detail:
        'Production URL corrected to https://ashtec.dino.icu, repository linked, SmartSparkCoding invited as a collaborator.',
    },
    {
      state: 'done',
      title: '/github and /gh redirect + GitHub button in the landing footer',
      detail: 'Both routes bounce to the repository; footer link is live in production.',
    },
    {
      state: 'done',
      title: 'Admin attendance CSV export tool',
      detail:
        'Tools tab: pick a show, get a crew x event grid with Yes/Maybe/No, downloadable as CSV. Deployed and verified.',
    },
    {
      state: 'active',
      title: 'Feedback roadmap — Batch 1: member profile extras',
      detail:
        'Custom status + emoji, birthday (MM-DD), contact-sheet opt-in with phone, mentor pairing. Schema columns added; endpoints, /contacts page and Settings fields in progress.',
    },
    {
      state: 'queued',
      title: 'Feedback roadmap — Batch 2: gamification',
      detail: 'Badges, hours leaderboard from attendance.',
    },
    {
      state: 'queued',
      title: 'Feedback roadmap — Batch 3: rehearsal & show ops',
      detail:
        'Checklists, pre-show sign-off, roll call, rehearsal notes, tech week, cue sheets, cue calls, sick cover, scene timings, rehearsal shuffle.',
    },
    {
      state: 'queued',
      title: 'Feedback roadmap — Batches 4–8',
      detail:
        'Show day extras, scheduling (clash detector, term overview, availability), app polish, announcements + DMs, then the fun ones (more cat, mascot, sound effects, show memories).',
    },
  ] as Track[],
  /** Recent shipped commits, newest first. */
  shipped: [
    'Feedback form: swap out 9 suggestions already built',
    'Tools: admin attendance CSV export',
    'Docs: reword README and correct the public URLs',
    'Add /github and /gh redirects and small GitHub link in landing footer',
  ],
  /** How to read the board. */
  legend: 'done = shipped to production · active = being written now · queued = next up',
} as const;

export type OpenCodeStatus = typeof OPENCODE_STATUS;
