/**
 * Client-side auth, replacing `zitejs/auth`.
 *
 * Preserves the exact surface the four importing components use:
 *   useAuth()                       -> { user, isLoading }
 *   logout()
 *   signIn.magicLink({ email, name, callbackURL }) -> { error } | null
 *   loginWithRedirect()
 *
 * `loginWithRedirect` existed only because Zite needed its own hosted page to
 * mint a brand-new auth user on a first-run install. Here the crew list *is* the
 * account store, so there is nothing to redirect to: every address that can sign
 * in can be sent a link directly. It is kept as a no-op so LoginScreen's
 * first-run branch still has something to call.
 */

import { useCallback, useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  window.dispatchEvent(new CustomEvent('crew:signed-out'));
  window.location.href = '/';
}

export const signIn = {
  /**
   * Returns `{ error }` on failure and `{}` on success. Always an object, so
   * callers can write `if (res.error)` without a null check -- Zite's version
   * had the same shape and LoginScreen relies on it.
   */
  async magicLink({ email, name, callbackURL = '/' }: { email: string; name?: string; callbackURL?: string }): Promise<{ error?: { message: string } }> {
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, callbackURL }),
      });
      if (!res.ok) return { error: { message: (await json<any>(res)).message ?? 'That did not work. Try again in a moment.' } };
      return {};
    } catch (e: any) {
      return { error: { message: e?.message ?? 'That did not work. Try again in a moment.' } };
    }
  },
};

export function loginWithRedirect(): void {
  // No hosted signup page exists in the self-hosted app; the crew list is the
  // account store. Sign-in links are issued on demand instead.
}

export function useAuth(): { user: AuthUser | null; isLoading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await json<{ user: AuthUser | null }>(await fetch('/api/auth/session', { credentials: 'same-origin' }));
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any endpoint answering 401 means the session went away underneath us.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('crew:unauthorized', onUnauthorized);
    window.addEventListener('crew:signed-out', onUnauthorized);
    return () => {
      window.removeEventListener('crew:unauthorized', onUnauthorized);
      window.removeEventListener('crew:signed-out', onUnauthorized);
    };
  }, []);

  return { user, isLoading };
}