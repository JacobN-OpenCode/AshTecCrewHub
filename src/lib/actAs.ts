/**
 * Admin "log in as" (impersonation).
 *
 * The server keeps the real session and adds a second cookie naming the member
 * the admin is acting as, so every request is made as that member and anything
 * they change is saved as them. This module is the client side of that: start,
 * stop, and "who am I acting as" for the banner.
 *
 * Plain fetch rather than a generated endpoint, because these three routes live
 * in server/index.ts: they set and clear a cookie, which the endpoint contract
 * has no way to express.
 */

export type ActAsState = { id: string; name: string; adminName: string } | null;

async function call(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { message?: string })?.message ?? 'That did not work.');
  return data as { acting?: ActAsState; member?: { id: string; name: string } };
}

/** Who the admin is acting as right now, or null. Never throws. */
export async function getActAs(): Promise<ActAsState> {
  try {
    const d = await call('/api/actAs');
    return d.acting ?? null;
  } catch {
    return null;
  }
}

/** Become that member. Reloads so every page refetches as them. */
export async function startActAs(memberId: string): Promise<void> {
  await call('/api/actAs', { memberId });
  window.location.href = '/';
}

/** Go back to being yourself. */
export async function stopActAs(): Promise<void> {
  await call('/api/leaveActAs', {});
  window.location.href = '/admin/members';
}
