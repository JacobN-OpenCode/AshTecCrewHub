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
  now: 'Batch 3 of the feedback roadmap: rehearsal and show ops (checklists, pre-show sign-off, roll call, cue sheets and friends).',
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
      title: '/opencode status page',
      detail: 'This board. Reads the file you are looking at now.',
    },
    {
      state: 'done',
      title: 'Admin attendance CSV export tool',
      detail:
        'Tools tab: pick a show, get a crew x event grid with Yes/Maybe/No, downloadable as CSV. Deployed and verified.',
    },
    {
      state: 'done',
      title: 'Feedback roadmap — Batch 1: member profile extras',
      detail:
        'Custom status + emoji on the rosters, birthday (month/day only) with a birthdays strip, contact-sheet opt-in with phone, and mentor pairing shown in Settings. Live in production.',
    },
    {
      state: 'done',
      title: 'Feedback roadmap — Batch 2: gamification',
      detail: 'Badges derived from crew stats, and a members-only hours leaderboard at /leaderboard, live in production.',
    },
    {
      state: 'active',
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
    'Batch 2: badges and an hours leaderboard',
    'Batch 1: birthdays strip, mentor display, status on rosters',
    'Add /opencode status page; batch 1 member profile extras',
    'Add /github and /gh redirects and small GitHub link in landing footer',
    'Docs: reword README and correct the public URLs',
    'Tools: admin attendance CSV export',
  ],
  /** How to read the board. */
  legend: 'done = shipped to production · active = being written now · queued = next up',
} as const;

export type OpenCodeStatus = typeof OPENCODE_STATUS;
