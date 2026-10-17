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
    'Working through the big /feedback/2 response: take out what should not be here, lock down the show workspaces, and make the whole hub feel like one system.',
  /** What is being touched right now. */
  now: 'Batch 2 is shipped (click-a-person profiles, controlled skills and privacy). Next: the admin settings hub, per-person permissions, and the show workspace lockdown.',
  /** The roadmap being worked through. */
  tracks: [
    {
      state: 'done',
      title: 'One dashboard per show',
      detail:
        'Live Show Setup and the per-show part of Manage Events now live inside the show dashboard (/show/:id) as admin tabs, so a show has one page instead of three. The standalone admin pages stay as cross-show overviews and link in.',
    },
    {
      state: 'done',
      title: 'High School Musical filled in',
      detail:
        'The 17-scene running order, a 31-cue sound sheet, props and principal costumes, a pre-show checklist, both casts and the term’s rehearsals are all seeded into the HSM show from the live running order and the production paperwork.',
    },
    {
      state: 'done',
      title: 'Multi-page public website',
      detail:
        'The signed-out side is a real site now: Home, Productions, Calendar, Parents, About, Join and a Sign in page, sharing one header and footer. Live at https://ashtec.dino.icu.',
    },
    {
      state: 'done',
      title: 'Remove Contacts, direct messages and the cat’s hide button',
      detail:
        'The Contacts page and the whole direct-message feature are gone (page, nav, routes and endpoints). The cat no longer has a Hide button and no longer appears on phones.',
    },
    {
      state: 'done',
      title: 'Hide nav tabs when there is nothing to show',
      detail:
        'Check-in only appears to normal crew while a session is actually open; admins and staff still see it to run one.',
    },
    {
      state: 'done',
      title: 'Email discipline',
      detail:
        'Error alerts now email maintainers only. Staff are never emailed unless they are a maintainer — signing in is the only mail a teacher gets. This is a student-led department.',
    },
    {
      state: 'done',
      title: 'People, not tabs',
      detail:
        'Click a crew member on the team roster or the leaderboard to see their card. Skills are now a controlled list an admin curates, not free text, and the Skills tab is gone — skills live on the person.',
    },
    {
      state: 'done',
      title: 'Privacy controls',
      detail:
        'In Settings, a member chooses who sees their picture, email and skills: everyone, admins only, or only me. Admins are never restricted and a member always sees their own record.',
    },
    {
      state: 'active',
      title: 'Show Workspace read-only for normal crew',
      detail:
        'Normal members can look but not edit the show workspaces. Admins can grant extra permissions per person, or take the normal ones away.',
    },
    {
      state: 'queued',
      title: 'ATCMS settings hub',
      detail:
        'The admin area becomes a real settings hub: cat name, feedback form creation, the skill list, and the rest of the knobs in one place.',
    },
    {
      state: 'queued',
      title: 'Signed-in devices',
      detail:
        'Settings lists the devices you are signed in on, with sign out everywhere and sign out all but this one.',
    },
    {
      state: 'queued',
      title: 'Profile fixes',
      detail:
        'Picture, initials, surname and year all editable again, including moving up more than one year or down.',
    },
    {
      state: 'queued',
      title: 'Cards or lists',
      detail:
        'Admins can choose whether admin pages show cards or lists, as a personal setting.',
    },
    {
      state: 'queued',
      title: 'Smart scene timings',
      detail:
        'Average how long each scene actually ran, learned from rehearsals and shows, with show timings taking priority.',
    },
    {
      state: 'queued',
      title: 'Streamline',
      detail:
        'One show all together, settings all together, and the live show reading its data from the show itself rather than a separate copy.',
    },
  ] as Track[],
  /** Recent shipped commits, newest first. */
  shipped: [
    'Feedback round 2, batch 2: click-a-person profiles, controlled skills, privacy controls',
    'Feedback round 2, batch 1: Contacts and direct messages removed, idle tabs hidden, email discipline',
    'Multi-page public website (Home, Productions, About, Join, Sign in)',
    'One dashboard per show, and High School Musical filled in',
    'Add /feedback/2, the freeform tidy-up form',
    'Support tickets: a home dashboard, pinned tickets, manual badges, and the ten-ticket tidy-up',
    'Batch 8: the fun ones (the cat everywhere, sound effects, a named mascot, show memories)',
    'Batch 7: the crew (announcements, direct messages, skills directory)',
    'Batch 6: app polish (push tuning, keyboard shortcuts, data export, accessibility, widgets, call sheets, offline)',
    'Batch 5: scheduling (clash detector, term view, availability, rotas, travel time, parents feed)',
    'Batch 4: show-day extras (photos, debrief, green room, lost property, box office)',
    'Batch 3: per-show workspace (checklists, cues, props, roll call, sign-off, cover)',
  ],
  /** How to read the board. */
  legend: 'done = shipped to production · active = being written now · queued = next up',
} as const;

export type OpenCodeStatus = typeof OPENCODE_STATUS;
