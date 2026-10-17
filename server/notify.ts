/**
 * Who gets notified about what, in one place.
 *
 * Two audiences:
 *   - "admin" notifications: operational, and the ones a maintainer or admin
 *     acts on immediately (new ticket, reply, someone waiting at venue check-in).
 *   - personal notifications: about the member's own commitments (a form due, a
 *     response deadline, needing to check in).
 *
 * Personal notifications have a per-kind switch the member owns (push tuning,
 * Batch 6): a kind they mute is skipped, and a kind they never touched is on.
 * Admin notifications have a single switch that defaults to on for admins.
 * Preview accounts never receive anything, because they are puppets an admin
 * signs into, not people.
 */

import { zite } from './db/index.js';
import { ids, isEmailable } from '../src/lib/server.js';
import { sendToMember, sendToMembers, claimNotification, type PushPayload } from './push.js';
import { Email } from './email.js';
import { isKindEnabled, parseNotificationPrefs } from '../src/lib/notificationKinds.js';

interface Person {
  id: string;
  firstName?: string;
  schoolEmail?: string;
  isAdmin?: boolean;
  isMaintainer?: boolean;
  isPreviewAccount?: boolean;
  adminNotifications?: boolean | null;
  notificationPrefs?: string;
}

const mayReceiveAdmin = (m: Person) => {
  if (m.isPreviewAccount) return false;
  if (!(m.isAdmin || m.isMaintainer)) return false;
  // Unset follows the default: on for admins.
  return m.adminNotifications === null || m.adminNotifications === undefined ? !!m.isAdmin : !!m.adminNotifications;
};

/**
 * Push tuning (Batch 6): personal notifications obey the member's per-kind
 * switch. A missing or unparseable blob means everything is on, so this can only
 * ever turn a notification off when the member explicitly asked for it.
 */
const allowsKind = (m: Person, kind: string): boolean => {
  if (m.isPreviewAccount) return false;
  return isKindEnabled(parseNotificationPrefs(m.notificationPrefs), kind);
};

/** The one-member case: load their record to read the tuning blob. */
async function allowsKindFor(memberId: string, kind: string): Promise<boolean> {
  const { records } = await zite.crewMembers.findAll({ filters: { id: memberId }, limit: 1 });
  const person = records[0] as unknown as Person | undefined;
  return person ? allowsKind(person, kind) : true;
}

async function crew(): Promise<Person[]> {
  const { records } = await zite.crewMembers.findAll({ limit: 2000 });
  return records as unknown as Person[];
}

/** Admins who have admin notifications on (default on). */
async function adminRecipients(): Promise<string[]> {
  return (await crew()).filter(mayReceiveAdmin).map((m) => m.id);
}

/** Maintainers who have admin notifications on - bug reports only. */
async function maintainerRecipients(): Promise<string[]> {
  return (await crew()).filter((m) => mayReceiveAdmin(m) && m.isMaintainer).map((m) => m.id);
}

// ---------------------------------------------------------- admin notifications

/**
 * Only a Bug Report reaches the maintainers; feature requests and general
 * support go to the admins who aren't staff. Maintainers exist to fix what is
 * broken, so they should not be paged for an idea or a question.
 */
const goesToMaintainers = (type?: string) => type === 'Bug Report';

/** A new support ticket. Bug reports go to maintainers; everything else to admins. */
export async function notifyNewTicket(ticket: {
  id: string;
  type?: string;
  subject?: string;
  submittedBy?: string | string[] | null;
}): Promise<void> {
  const isBug = goesToMaintainers(ticket.type);
  const submitterId = ids(ticket.submittedBy)[0];
  // Ticket 42ca4f1f: don't push a maintainer their own ticket back.
  const recipients = (isBug ? await maintainerRecipients() : await adminRecipients()).filter((id) => id !== submitterId);
  if (!recipients.length) return;

  const from = submitterId ? (await crew()).find((m) => m.id === submitterId) : undefined;
  const who = from ? `${from.firstName ?? ''}`.trim() || 'Someone' : 'Someone';

  await sendToMembers(recipients, {
    title: isBug ? `New ${ticket.type?.toLowerCase()}` : 'New support ticket',
    body: `${who}: ${ticket.subject ?? 'a new ticket'}`,
    url: `/admin/support/${ticket.id}`,
    tag: `ticket-${ticket.id}`,
  });
}

/**
 * Someone answered a feedback form (see /feedback/:formId). Pushes the admins so
 * the results actually get looked at, and never pings the person who just answered.
 */
export async function notifyFeedbackResponse(info: { memberId: string; form: string; selectedCount: number }): Promise<void> {
  const recipients = (await adminRecipients()).filter((id) => id !== info.memberId);
  if (!recipients.length) return;
  const n = info.selectedCount;
  await sendToMembers(recipients, {
    title: 'New feedback',
    body: n ? `Someone picked ${n} idea${n === 1 ? '' : 's'}` : 'Someone left a note',
    url: '/admin/feedback',
    tag: `feedback-${info.form}-${info.memberId}`,
  });
}

/** A reply on a ticket, to the people who look after that kind of ticket. */
export async function notifyTicketReply(ticket: {
  id: string;
  type?: string;
  subject?: string;
  lastReplyFrom?: string;
}): Promise<void> {
  // Only nudge for a crew member's reply; an admin's own reply does not need to
  // tell the other admins about itself.
  if (ticket.lastReplyFrom === 'Maintainer') return;
  const isBug = goesToMaintainers(ticket.type);
  const recipients = isBug ? await maintainerRecipients() : await adminRecipients();
  if (!recipients.length) return;

  await sendToMembers(recipients, {
    title: 'New reply on a ticket',
    body: ticket.subject ?? 'A ticket has a new reply',
    url: `/admin/support/${ticket.id}`,
    tag: `ticket-${ticket.id}`,
  });
}

/**
 * A manual nudge (b9f059cf): someone clicked "Remind maintainers", so the
 * people who look after a ticket get a push pointing at the support list.
 * Only reaches maintainers who have admin notifications on, like the other
 * admin pushes.
 */
export async function notifySupportReminder(memberIds: string[], notice: { count: number; url: string }): Promise<void> {
  const wanted = new Set(memberIds);
  const recipients = (await crew()).filter((m) => wanted.has(m.id) && mayReceiveAdmin(m)).map((m) => m.id);
  if (!recipients.length) return;
  await sendToMembers(recipients, {
    title: notice.count === 1 ? 'A support ticket is waiting' : `${notice.count} support tickets are waiting`,
    body: 'Maintainers, a reply is due on these tickets.',
    url: notice.url,
    tag: 'support-reminder',
  });
}

/** A ticket call whose details were changed by the person who raised it (5b5f0c2a). */
export async function notifyTicketEdited(ticket: {
  id: string;
  type?: string;
  subject?: string;
}): Promise<void> {
  const isBug = goesToMaintainers(ticket.type);
  const recipients = isBug ? await maintainerRecipients() : await adminRecipients();
  if (!recipients.length) return;

  await sendToMembers(recipients, {
    title: 'Ticket updated by the sender',
    body: `${ticket.subject ?? 'a ticket'} was updated`,
    url: `/admin/support/${ticket.id}`,
    tag: `ticket-${ticket.id}`,
  });
}

/** Someone is waiting for an admin to approve a venue sign-in/out. */
export async function notifyPresenceWaiting(memberName: string, action: string): Promise<void> {
  const recipients = await adminRecipients();
  if (!recipients.length) return;
  await sendToMembers(recipients, {
    title: `Waiting to ${action.toLowerCase()}`,
    body: `${memberName} is waiting for you to approve.`,
    // Deep-link straight into the in-app scanner, so tapping the notification
    // lands on the camera rather than the roster.
    url: '/admin/attendance?scan=1',
    tag: 'presence-waiting',
  });
}

/**
 * Ticket 20c8af90: tell the maintainers when the hub throws an error, so a bug
 * a member hits does not sit unnoticed until they file a ticket about it.
 *
 * This is deliberately noisy-proof: the same source+message is only reported
 * once per window, so a hot loop cannot flood anyone. Delivery is both a push
 * (seen immediately) and an email (kept as a record), to maintainers and admins
 * who have admin notifications on, exactly like the other admin alerts.
 */
const SERVER_ALERT_WINDOW_MS = 15 * 60 * 1000;
const recentServerAlerts = new Map<string, number>();

export async function notifyServerError(info: { source: string; message: string; detail?: string }): Promise<void> {
  const message = String(info.message ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 200);
  const key = `${info.source}|${message}`.slice(0, 300);
  const now = Date.now();
  for (const [k, t] of recentServerAlerts) if (now - t > SERVER_ALERT_WINDOW_MS) recentServerAlerts.delete(k);
  if (recentServerAlerts.has(key)) return;
  recentServerAlerts.set(key, now);

  const people = (await crew()).filter((m) => mayReceiveAdmin(m) && (m.isMaintainer || m.isAdmin));
  if (!people.length) return;

  await sendToMembers(people.map((m) => m.id), {
    title: 'Crew hub error',
    body: `${info.source}: ${message}`.slice(0, 180),
    url: '/admin/support',
    tag: `server-error-${info.source}`,
  }).catch(() => 0);

  const detail = info.detail ? `\n\n> ${String(info.detail).slice(0, 500).split('\n').join('\n> ')}` : '';
  const body = [
    { type: 'text' as const, content: `**An error occurred in the crew hub.**\n\nWhere: \`${info.source}\`\n\nWhat: ${message}${detail}` },
    { type: 'button' as const, label: 'Open the support tab', href: `${process.env.APP_URL ?? ''}/admin/support` },
  ];
  await Promise.all(
    people.filter((m) => isEmailable(m as never)).map(async (m) => {
      try {
        await Email.send({ to: m.schoolEmail!, subject: `Crew hub error: ${info.source}`, body });
      } catch {
        /* keep going */
      }
    }),
  );
}

// ------------------------------------------------------- personal notifications

/** A form (show or event response) is due soon. */
export async function notifyFormDue(
  memberId: string,
  what: { kind: 'show' | 'event'; title: string; dueDate: string }
): Promise<void> {
  // Check the member's tuning before claiming, so a muted member does not burn
  // the dedupe key and miss the reminder after turning it back on.
  if (!(await allowsKindFor(memberId, 'form-due'))) return;
  if (!(await claimNotification(memberId, 'form-due', `${what.kind}:${what.title}:${what.dueDate}`))) return;
  await sendToMember(memberId, {
    title: 'A form is due',
    body: `${what.title} needs a response by ${what.dueDate}.`,
    url: '/',
    tag: `form-${what.kind}`,
  });
}

/** A venue check-in session is open and this member has not signed in. */
export async function notifyCheckInPrompt(memberId: string, sessionId: string, title: string): Promise<void> {
  if (!(await allowsKindFor(memberId, 'checkin-prompt'))) return;
  if (!(await claimNotification(memberId, 'checkin-prompt', sessionId))) return;
  await sendToMember(memberId, {
    title: 'Check in to the venue',
    body: `${title}: tap to sign in.`,
    url: '/attendance',
    tag: 'checkin',
  });
}

/**
 * This member said they would be back by a time and has not returned. Sent to
 * them, and to admins, because in a venue the person who needs to know is often
 * the stage manager, not only the member.
 */
export async function notifyOverdueReturn(memberId: string, name: string, expectedBackAt: string): Promise<void> {
  // Tuning mutes only the member's own nudge; the stage-manager alert below
  // still goes out, because someone being overdue is a safety matter.
  if (await allowsKindFor(memberId, 'overdue-return')) {
    if (await claimNotification(memberId, 'overdue-return', expectedBackAt)) {
      const when = new Date(expectedBackAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      await sendToMember(memberId, {
        title: 'You are overdue',
        body: `You said you would be back by ${when}. Tap to sign back in.`,
        url: '/attendance',
        tag: 'overdue',
      });
    }
  }
  const when = new Date(expectedBackAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const admins = (await adminRecipients()).filter((id) => id !== memberId);
  if (admins.length) {
    await sendToMembers(admins, {
      title: 'Not returned yet',
      body: `${name} said they would be back by ${when}.`,
      url: '/admin/attendance',
      tag: `overdue-${memberId}`,
    });
  }
}

/** An event's date or time changed. */
export async function notifyEventUpdated(eventId: string, title: string, change: string): Promise<void> {
  const { records: subs } = await zite.subEvents.findAll({ filters: { id: eventId }, limit: 1 });
  const sub = subs[0];
  const { records: members } = await zite.crewMembers.findAll({ limit: 2000 });
  const { records: resps } = await zite.showResponses.findAll({ limit: 5000 });
  const { records: att } = await zite.attendance.findAll({ limit: 5000 });

  // Anyone who said yes/maybe to a show this event is in, or who has an
  // attendance row, is affected.
  const showIds = ids(sub?.shows as never);
  const interested = new Set<string>();
  for (const r of resps) {
    if (['Yes', 'Maybe'].includes(r.response ?? '') && showIds.includes(ids(r.show)[0] ?? '')) {
      interested.add(ids(r.member)[0] ?? '');
    }
  }
  for (const a of att) if (ids(a.subEvent)[0] === eventId) interested.add(ids(a.member)[0] ?? '');
  interested.delete('');

  const byId = new Map((members as unknown as Person[]).map((m) => [m.id, m]));
  for (const id of interested) {
    // Honour each member's "event changes" switch before claiming the key.
    const person = byId.get(id);
    if (person && !allowsKind(person, 'event-updated')) continue;
    if (!(await claimNotification(id, 'event-updated', `${eventId}:${change}`))) continue;
    await sendToMember(id, {
      title: 'Event updated',
      body: `${title}: ${change}`,
      url: '/calendar',
      tag: `event-${eventId}`,
    });
  }
}

/**
 * A cue call: a direct nudge to specific crew members about an event. The same
 * call repeated is deduped so a tap-happy sender cannot spam a phone.
 */
export async function notifyCueCall(info: {
  memberIds: string[];
  subEventId: string;
  showId?: string;
  title: string;
  message: string;
  from: string;
}): Promise<void> {
  const body = info.message || 'You are called.';
  const url = info.showId ? `/show/${info.showId}` : '/calendar';
  const byId = new Map((await crew()).map((m) => [m.id, m]));
  for (const id of [...new Set(info.memberIds)]) {
    const person = byId.get(id);
    if (person && !allowsKind(person, 'cue-call')) continue;
    if (!(await claimNotification(id, 'cue-call', `${info.subEventId}:${info.from}:${body}`))) continue;
    await sendToMember(id, { title: `Cue call: ${info.title}`, body: `${info.from}: ${body}`, url, tag: `cue-${info.subEventId}` });
  }
}

/**
 * Someone needs cover for an event. Told to the whole crew (a push, not an
 * email) so whoever is free can step in; deduped per event + requester.
 */
export async function notifyCoverRequest(info: {
  subEventId: string;
  showId?: string;
  title: string;
  requester: string;
  requesterId: string;
  role: string;
}): Promise<void> {
  const url = info.showId ? `/show/${info.showId}` : '/calendar';
  const who = (await crew())
    .filter((m) => !m.isPreviewAccount && m.id !== info.requesterId && allowsKind(m, 'cover-request'))
    .map((m) => m.id);
  for (const id of who) {
    if (!(await claimNotification(id, 'cover-request', `${info.subEventId}:${info.requesterId}`))) continue;
    await sendToMember(id, {
      title: `Cover needed: ${info.title}`,
      body: `${info.requester} can no longer make it${info.role ? ` (${info.role})` : ''}. Can you help?`,
      url,
      tag: `cover-${info.subEventId}`,
    });
  }
}

/**
 * A new crew announcement (Batch 7). Fanned out to every member who has not
 * muted the announcements kind; deduped per announcement so editing one does
 * not re-ping the crew. Preview accounts never receive it.
 */
export async function notifyAnnouncement(info: { id: string; title: string; body: string; authorName: string }): Promise<void> {
  const who = (await crew())
    .filter((m) => !m.isPreviewAccount && allowsKind(m, 'announcement'))
    .map((m) => m.id);
  const dedupe = `announcement-${info.id}`;
  for (const id of who) {
    if (!(await claimNotification(id, 'announcement', dedupe))) continue;
    await sendToMember(id, {
      title: `Announcement: ${info.title}`,
      body: info.authorName ? `${info.authorName}: ${info.body}` : info.body,
      url: '/announcements',
      tag: dedupe,
    });
  }
}

/**
 * A direct message (Batch 7). Only the recipient is told, and only if they have
 * not muted the messages kind. Never tells the sender about their own message.
 */
export async function notifyDirectMessage(info: { id: string; toId: string; fromId: string; fromName: string; body: string }): Promise<void> {
  if (info.toId === info.fromId) return;
  if (!(await allowsKindFor(info.toId, 'dm'))) return;
  if (!(await claimNotification(info.toId, 'dm', `dm-${info.id}`))) return;
  await sendToMember(info.toId, {
    title: `Message from ${info.fromName}`,
    body: info.body.slice(0, 140),
    url: `/messages?to=${info.fromId}`,
    tag: `dm-${info.id}`,
  });
}
