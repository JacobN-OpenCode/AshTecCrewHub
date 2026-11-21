/**
 * What counts as an acceptable profile picture value.
 *
 * Ticket 3bf93c2e ("I still can't upload a profile pic"): our own uploader
 * returns a same-origin relative path (`/api/uploads/avatars/<owner>-<hash>.jpg`),
 * but every save path insisted on `http(s)://`. The upload worked, then saving
 * the profile threw it away with "The picture must be a link starting with
 * http:// or https://", which looks exactly like upload being broken.
 *
 * So: any absolute http(s) URL, or a relative path under the folder we host.
 * Nothing else, and never a path that climbs out of it.
 */
export const AVATAR_UPLOAD_PREFIX = '/api/uploads/avatars/';

export function isAvatarUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (/\s/.test(url)) return false;
  if (/^https?:\/\//i.test(url)) return true;
  return url.startsWith(AVATAR_UPLOAD_PREFIX) && !url.includes('..');
}

/** Shared wording, so the client guard and the two endpoints agree. */
export const AVATAR_URL_MESSAGE =
  'The picture must be a link starting with http:// or https://, or a picture you uploaded here.';
