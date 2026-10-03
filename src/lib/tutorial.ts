/**
 * Tour content. Every step points at a real element via a `data-tour` attribute,
 * so the copy can never drift away from what is actually on screen.
 *
 * `advance: 'target'` means the tour waits for the user to click the highlighted
 * element. That is only ever used for read-only navigation (nav links, the
 * admin dropdown), because a tour must not save a profile, add a crew member or
 * submit a response on the user's behalf. Anything that writes uses 'next'.
 *
 * Roles: an Actor lands on Stage Layout at '/', so they must never be shown the
 * show-response copy. Admin steps are filtered out for everyone else.
 */
export type Step = {
  id: string;
  path: string;
  target?: string;
  title: string;
  body: string;
  advance: 'target' | 'next';
  adminOnly?: boolean;
  actorOnly?: boolean;
  /** Hide from Actors. Their home page has no show-response controls. */
  notActorOnly?: boolean;
};

export const TOUR: Step[] = [
  {
    id: 'welcome',
    path: '/',
    title: 'Welcome aboard',
    body: 'This quick tour points out the handful of things that actually matter. You can skip any step, and reopen this tour any time with the ? button.',
    advance: 'next',
  },
  {
    id: 'nav',
    path: '/',
    target: 'nav',
    title: 'Move around',
    body: 'Every page you can reach sits here. Click around while the tour is open and it will follow you.',
    advance: 'target',
  },
  {
    id: 'events',
    path: '/',
    target: 'show-respond',
    title: 'Say if you can make a show',
    body: 'Tell the crew admin whether you are in, maybe, or not taking part. Once you are in, each rehearsal and performance gets its own reply further down this card.',
    advance: 'next',
    // An Actor's home page is the stage layout, which has no response buttons,
    // so pointing them at one left them staring at a blank spotlight.
    notActorOnly: true,
  },
  {
    id: 'actor-home',
    path: '/',
    title: 'Who to contact',
    body: 'As an Actor you do not get show response buttons. This page is the quickest way to find out who to ask about anything.',
    advance: 'next',
    actorOnly: true,
  },
  {
    id: 'calendar',
    path: '/calendar',
    target: 'calendar-filters',
    title: 'The shared calendar',
    body: 'Every rehearsal and performance for every show, so you can see what clashes. Filter by show or type, and anything without a confirmed date is listed underneath rather than silently dropped.',
    advance: 'next',
  },
  {
    id: 'profile',
    path: '/profile',
    target: 'profile-save',
    title: 'Your details',
    body: 'Keep your preferred name and pronouns current so the crew list and emails stay right.',
    advance: 'next',
  },
  {
    id: 'admin-menu',
    path: '/',
    target: 'admin-menu',
    title: 'Everything admin',
    body: 'All the management pages live behind this one dropdown, which keeps the top bar short. The number on it is how many support tickets are waiting on you.',
    advance: 'target',
    adminOnly: true,
  },
  {
    id: 'admin-events',
    path: '/admin/events',
    target: 'events-new',
    title: 'Shows and events',
    body: 'Create a show here, then add its rehearsals and performances to it. Each event has a date, a meet time and a show, which is what feeds the shared calendar.',
    advance: 'next',
    adminOnly: true,
  },
  {
    id: 'admin-crew',
    path: '/admin/members',
    target: 'crew-add',
    title: 'The crew list',
    body: 'Add members, change roles, and switch on preview mode to see exactly what the app looks like through someone else’s eyes before you change anything.',
    advance: 'next',
    adminOnly: true,
  },
  {
    id: 'admin-support',
    path: '/admin/support',
    target: 'support-search',
    title: 'Support tickets',
    body: 'Bug reports and feature requests land here and email you. Reply in the thread and the user gets an email with your answer, so nobody is left guessing.',
    advance: 'next',
    adminOnly: true,
  },
  {
    id: 'emails',
    path: '/admin/emails',
    target: 'emails-search',
    title: 'Email log',
    body: 'Every message the app has sent, with what went out and who it reached. Useful when someone says they never got a notification.',
    advance: 'next',
    adminOnly: true,
  },
  {
    id: 'help',
    path: '/',
    target: 'support',
    title: 'Help and feedback',
    body: 'Found a bug, got an idea, or just need a hand? This button goes straight to the maintainers, and it automatically tells them which page you were on.',
    advance: 'next',
  },
];

export const SEEN_KEY = (id: string) => `ashtec-tutorial-seen:${id}`;
