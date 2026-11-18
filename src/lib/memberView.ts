/**
 * Member view: an admin's own phone, showing only the pages a member sees.
 *
 * It is a per-device preference, not a permission. Nothing is hidden on the
 * server and nothing stops them switching back (that is deliberate: it is a
 * way to stop mis-tapping admin buttons from the side of a stage, not a lock).
 * Kept in localStorage so it survives a reload, a locked phone and a restart.
 */
const KEY = 'ashtec-member-view';

export function memberViewOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMemberView(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: fall through to the reload, which is the visible part */
  }
  // A full reload is the honest way to do this: every page, the nav, the tab
  // bar and the cached queries all rebuild against the new view.
  window.location.reload();
}
