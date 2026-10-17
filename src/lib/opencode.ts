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
  now: 'All of the /feedback/2 response is shipped. Final pass: typecheck, build, smoke and a deploy, then it is over to the crew.',
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
      state: 'done',
      title: 'Show Workspace read-only for normal crew',
      detail:
        'Normal members can look but not edit a show workspace, enforced on the server as well as the page. Admins grant extra permissions per person (Edit show workspaces, Run a show day, Post announcements and more) or take away a default, from the member editor.',
    },
    {
      state: 'done',
      title: 'ATCMS settings hub',
      detail:
        'A new /admin/settings page: the cat’s name, the skill list members pick from (and whether they can edit it), and feedback forms an admin can create and share as /feedback/<id>. Plus the admin layout choice.',
    },
    {
      state: 'done',
      title: 'Signed-in devices',
      detail:
        'Settings lists every device you are signed in on, with sign out for one device, all other devices, or everything. Sessions carry a user-agent and last-seen time; the session id never leaves the server.',
    },
    {
      state: 'done',
      title: 'Cards or lists',
      detail:
        'Admins can show admin pages as cards (the default) or a plain list, as a per-device preference. The overview switches live.',
    },
    {
      state: 'done',
      title: 'Profile fixes',
      detail:
        'A member with no roles picked can now save their picture, initials, surname and year again — the save was blocked until two roles were chosen. Moving up more than one year, or down, both work.',
    },
    {
      state: 'done',
      title: 'Smart scene timings',
      detail:
        'Scene run-times are recorded as rehearsal or show, and the average prefers show timings over rehearsal ones. The workspace shows a per-scene best estimate and a total estimated run.',
    },
    {
      state: 'done',
      title: 'Streamline',
      detail:
        'One show all together (the dashboard tabs), settings all together (Settings and ATCMS settings), and the live running order can be pulled from the show’s own scenes with “Import from show”.',
    },
  ] as Track[],
  /** Recent shipped commits, newest first. */
  shipped: [
    'Feedback round 2, batch 4: ATCMS settings hub, signed-in devices, smart timings, profile fixes',
    'Feedback round 2, batch 3: show workspaces locked down, per-person permissions',
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
