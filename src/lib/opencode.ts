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
  updated: '2026-10-17',
  /** One line on the assistant's current focus. */
  headline:
    'Shipping the feedback roadmap in batches, plus small site and repo chores in between.',
  /** What is being touched right now. */
  now: 'Batch 7 of the feedback roadmap: the crew (a crew-wide announcements feed, private direct messages with an unread badge, and a searchable skills directory).',
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
      state: 'done',
      title: 'Feedback roadmap — Batch 3: rehearsal & show ops',
      detail:
        'A per-show Workspace at /show/:id: checklists, cue sheets, props and costumes, scenes, rehearsal notes, scene timings, plus a Show-day tab with roll call, pre-show sign-off, cue calls and sick cover. Locked for Tech Week by admins. Live in production.',
    },
    {
      state: 'done',
      title: 'Feedback roadmap — Batch 4: show-day extras',
      detail:
        'Backstage photo albums (by link), a shared post-show debrief, a green-room noticeboard with pinning, a lost property log, nightly box-office headcounts with a run total, and an opening-night countdown on the home screen. Live in production.',
    },
    {
      state: 'done',
      title: 'Feedback roadmap — Batch 5: scheduling',
      detail:
        'A clash detector, term-at-a-glance with exam blackout dates, "when am I not free" availability, self sign-up rotas, travel-time padding, per-event reminder tuning, and a shareable calendar feed for parents. Live in production.',
    },
    {
      state: 'done',
      title: 'Feedback roadmap — Batch 6: app polish',
      detail:
        'Per-kind push tuning and a notification history, keyboard shortcuts, a one-click data export, accessibility settings (text size and high contrast), a next-call widget and a watch companion, printable call sheets, and offline reads for the pages a show day depends on. Live in production.',
    },
    {
      state: 'active',
      title: 'Feedback roadmap — Batch 7: the crew',
      detail:
        'A crew-wide announcements feed admins post to (and push), private direct messages between members with an unread badge, and a searchable skills directory of who can teach what.',
    },
    {
      state: 'queued',
      title: 'Feedback roadmap — Batch 8: the fun ones',
      detail:
        'More cat, a mascot, sound effects and show memories.',
    },
  ] as Track[],
  /** Recent shipped commits, newest first. */
  shipped: [
    'Batch 6: app polish (push tuning, keyboard shortcuts, data export, accessibility, widgets, call sheets, offline)',
    'Batch 5: scheduling (clash detector, term view, availability, rotas, travel time, parents feed)',
    'Batch 4: show-day extras (photos, debrief, green room, lost property, box office)',
    'Batch 3: per-show workspace (checklists, cues, props, roll call, sign-off, cover)',
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
