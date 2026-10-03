// Copy shared by every email the app sends, so the wording stays identical
// across admin messages, form reminders and support replies.

/** Max characters allowed in a support ticket message. */
export const SUPPORT_MESSAGE_MAX = 20000;

/**
 * Warn against emailing back. Replies to the app's address are not read.
 * Pass `email` when there is a named person to contact instead; leaving it
 * empty drops that sentence rather than emitting a dead [](mailto:) link.
 */
export const noReplyNotice = (name: string, email: string) =>
  `Please don't reply to this email, because nobody ~~will hear your screams~~ will see your reply.` +
  (email ? ` If you need to respond, contact ${name} directly at [${email}](mailto:${email}).` : '');

/** Sits at the bottom of every automated email we send. */
export const automatedFooter = () =>
  `Thanks,\n\n**AshTec Crew Management System**\n_Created by Jacob Navaratne_\n\n` +
  `_Spotted a bug, or got an idea? Click the orange **Help & feedback** button in the ` +
  `bottom-left of the Crew Hub, then pick the option that fits._`;
