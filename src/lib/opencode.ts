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
    'The big /feedback/2 response is shipped, and round two of the settings work is going out: cards-or-lists everywhere, far more control in ATCMS settings, and the leaderboard removed.',
  /** What is being touched right now. */
  now: 'The Mac and Wear OS apps are shipped and downloadable from /apps (invite code JN202610), and the in-app icons are back to normal.',
  /** The roadmap being worked through. */
  tracks: [
    {
      state: 'done',
      title: 'The cat is the app icon',
      detail:
        'The favicon, the home-screen/PWA icons and the Apple touch icon are the cat. (The in-app UI icons were briefly the cat too — that was a misread and is reverted; the real icons are back.)',
    },
    {
      state: 'done',
      title: 'A real Mac app',
      detail:
        'The whole crew hub in a native window (WKWebView, AppKit, no Xcode needed), with a Dock icon, a toolbar, a menu-bar extra showing a live countdown to your next call, notifications before a call, and sign-in that finishes in-app from the emailed link.',
    },
    {
      state: 'done',
      title: 'A Wear OS app',
      detail:
        'A watch face for the next call: the next call, a live countdown and the next few, read from /next-call.json. Built and signed as a plain APK (no Gradle, no Play Store).',
    },
    {
      state: 'done',
      title: 'The /apps download page',
      detail:
        'Behind an invite code: pick Wear OS or macOS and get the download plus sideload / install instructions. Linked from the homepage footer. No stores involved.',
    },
    {
      state: 'done',
      title: 'Cards or lists, everywhere',
      detail:
        'The admin layout choice (cards by default) now drives the crew dashboard, the support dashboard, the events dashboard and the overview. Set it under Preferences in ATCMS settings.',
    },
    {
      state: 'done',
      title: 'More control in settings',
      detail:
        'ATCMS settings now covers: Preferences (cards/lists), Branding (platform and school names), Features (turn Schedule, Announcements, Memories, the cat, Tools, Parents, Live show, Badges and Check-in on or off), the cat name, the skill list, the crew option lists (roles, years, member types) and feedback forms.',
    },
    {
      state: 'done',
      title: 'Leaderboard and badges removed',
      detail:
        'The crew hours leaderboard is gone (page, nav, route, endpoint), and so are badges — the catalogue, the badge wall, the manual grants in the member editor and the Badges feature switch. Nothing ranks crew against each other any more.',
    },
    {
      state: 'done',
      title: 'ATCMS settings hub',
      detail:
        'A new /admin/settings page: the cat’s name, the skill list members pick from (and whether they can edit it), and feedback forms an admin can create and share as /feedback/<id>.',
    },
    {
      state: 'done',
      title: 'Signed-in devices',
      detail:
        'Settings lists every device you are signed in on, with sign out for one device, all other devices, or everything.',
    },
    {
      state: 'done',
      title: 'Profile fixes',
      detail:
        'A member with no roles picked can now save their picture, initials, surname and year again. Moving up more than one year, or down, both work.',
    },
    {
      state: 'done',
      title: 'Smart scene timings',
      detail:
        'Scene run-times are recorded as rehearsal or show, and the average prefers show timings over rehearsal ones, with a total estimated run.',
    },
    {
      state: 'done',
      title: 'Streamline',
      detail:
        'One show all together (the dashboard tabs), settings all together, and the live running order can be pulled from the show’s own scenes.',
    },
    {
      state: 'done',
      title: 'Show Workspace read-only for normal crew',
      detail:
        'Normal members can look but not edit a show workspace. Admins grant or revoke permissions per person.',
    },
    {
      state: 'done',
      title: 'People, privacy and skills',
      detail:
        'Click a person for their card; skills are an admin-curated list; per-field privacy for picture, email and skills.',
    },
    {
      state: 'done',
      title: 'Removals and email discipline',
      detail:
        'Contacts and direct messages gone, idle tabs hidden, error emails to maintainers only, no staff email unless a maintainer.',
    },
    {
      state: 'done',
      title: 'One dashboard per show',
      detail:
        'Live Show Setup and the per-show part of Manage Events live inside the show dashboard (/show/:id) as admin tabs.',
    },
    {
      state: 'done',
      title: 'High School Musical filled in',
      detail:
        'The 17-scene running order, a 31-cue sound sheet, props, costumes, a checklist, both casts and the term’s rehearsals are seeded into the HSM show.',
    },
    {
      state: 'done',
      title: 'Multi-page public website',
      detail:
        'The signed-out side is a real site: Home, Productions, Calendar, Parents, About, Join and a Sign in page. Live at https://ashtec.dino.icu.',
    },
  ] as Track[],
  /** Recent shipped commits, newest first. */
  shipped: [
    'Mac app, Wear OS app, and the /apps download page',
    'Badges removed (with the leaderboard), settings expanded',
    'Round 2: cards/lists everywhere, ATCMS settings expanded, leaderboard removed',
    'Feedback round 2, batch 4: ATCMS settings hub, signed-in devices, smart timings, profile fixes',
    'Feedback round 2, batch 3: show workspaces locked down, per-person permissions',
    'Feedback round 2, batch 2: click-a-person profiles, controlled skills, privacy controls',
    'Feedback round 2, batch 1: Contacts and direct messages removed, idle tabs hidden, email discipline',
    'Multi-page public website (Home, Productions, About, Join, Sign in)',
    'One dashboard per show, and High School Musical filled in',
    'Add /feedback/2, the freeform tidy-up form',
    'Support tickets: a home dashboard, pinned tickets, manual badges, and the ten-ticket tidy-up',
  ],
  /** How to read the board. */
  legend: 'done = shipped to production · active = being written now · queued = next up',
} as const;

export type OpenCodeStatus = typeof OPENCODE_STATUS;
