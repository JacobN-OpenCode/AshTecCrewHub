/**
 * Who gets notified about what, in one place.
 *
 * Two audiences:
 *   - "admin" notifications: operational, and the ones a maintainer or admin
 *     acts on immediately (new ticket, reply, someone waiting at venue check-in).
 *   - personal notifications: about the member's own commitments (a form due, a
 *     response deadline, needing to check in).
 *
 * Personal notifications always go out; only the admin ones have a switch, and it
 * defaults to on for admins. Preview accounts never receive anything, because
 * they are puppets an admin signs into, not people.
 */

import { zite } from './db/index.js';
import { ids } from '../src/lib/server.js';
import { sendToMember, sendToMembers, claimNotification, type PushPayload } from './push.js';

interface Person {
  id: string;
  firstName?: string;
  isAdmin?: boolean;
  isMaintainer?: boolean;
  isPreviewAccount?: boolean;
  adminNotifications?: boolean | null;
}

const mayReceiveAdmin = (m: Person) => {
  if (m.isPreviewAccount) return false;
  if (!(m.isAdmin || m.isMaintainer)) return false;
  // Unset follows the default: on for admins.
  return m.adminNotifications === null || m.adminNotifications === undefined ? !!m.isAdmin : !!m.adminNotifications;
};

async function crew(): Promise<Person[]> {
  const { records } = await zite.crewMembers.findAll({ limit: 2000 });
  return records as unknown as Person[];
}

/** Admins who have admin notifications on (default on). */
async function adminRecipients(): Promise<string[]> {
  return (await crew()).filter(mayReceiveAdmin).map((m) => m.id);
}

/** Maintainers who have admin notifications on - bug reports and feature requests. */
async function maintainerRecipients(): Promise<string[]> {
  return (await crew()).filter((m) => mayReceiveAdmin(m) && m.isMaintainer).map((m) => m.id);
}

// ---------------------------------------------------------- admin notifications

/** A new support ticket. Bug reports and feature requests go to maintainers. */
export async function notifyNewTicket(ticket: {
  id: string;
  type?: string;
  subject?: string;
  submittedBy?: string | string[] | null;
}): Promise<void> {
  const isCoding = ticket.type === 'Bug Report' || ticket.type === 'Feature Request';
  const recipients = isCoding ? await maintainerRecipients() : await adminRecipients();
  if (!recipients.length) return;

  const submitterId = ids(ticket.submittedBy)[0];
  const from = submitterId ? (await crew()).find((m) => m.id === submitterId) : undefined;
  const who = from ? `${from.firstName ?? ''}`.trim() || 'Someone' : 'Someone';

  await sendToMembers(recipients, {
    title: isCoding ? `New ${ticket.type?.toLowerCase()}` : 'New support ticket',
    body: `${who}: ${ticket.subject ?? 'a new ticket'}`,
    url: `/admin/support/${ticket.id}`,
    tag: `ticket-${ticket.id}`,
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
  const isCoding = ticket.type === 'Bug Report' || ticket.type === 'Feature Request';
  const recipients = isCoding ? await maintainerRecipients() : await adminRecipients();
  if (!recipients.length) return;

  await sendToMembers(recipients, {
    title: 'New reply on a ticket',
    body: ticket.subject ?? 'A ticket has a new reply',
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
    url: '/admin/attendance',
    tag: 'presence-waiting',
  });
}

// ------------------------------------------------------- personal notifications

/** A form (show or event response) is due soon. */
export async function notifyFormDue(
  memberId: string,
  what: { kind: 'show' | 'event'; title: string; dueDate: string }
): Promise<void> {
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
  if (!(await claimNotification(memberId, 'overdue-return', expectedBackAt))) return;
  const when = new Date(expectedBackAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  await sendToMember(memberId, {
    title: 'You are overdue',
    body: `You said you would be back by ${when}. Tap to sign back in.`,
    url: '/attendance',
    tag: 'overdue',
  });
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

  for (const id of interested) {
    if (!(await claimNotification(id, 'event-updated', `${eventId}:${change}`))) continue;
    await sendToMember(id, {
      title: 'Event updated',
      body: `${title}: ${change}`,
      url: '/calendar',
      tag: `event-${eventId}`,
    });
  }
  void members;
}
