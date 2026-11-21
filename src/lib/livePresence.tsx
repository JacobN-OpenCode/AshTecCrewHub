import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getPresence } from '#api';
import { pv } from './preview';

export type MyPresence = {
  state: string | null
  reasonLabel: string
  reason: string
  comingBack: boolean
  expectedBackAt: string | null
  signedInAt: string | null
  signedOutAt: string | null
  pendingAction: string | null
  approvalToken?: string | null
};

export type LiveSession = { id: string; title: string; type: string; date: string | null; startedAt: string | null };

type Live = {
  session: LiveSession | null
  me: MyPresence | null
  loading: boolean
  refresh: () => Promise<void>
};

const Ctx = createContext<Live>({ session: null, me: null, loading: true, refresh: async () => {} });

/**
 * One poller for "is a check-in session open, and where do I stand?" shared by
 * the header dot, the banner, and the Check-in page itself.
 *
 * They each used to poll separately, which meant three identical requests in the
 * seconds after a member pressed Sign in - exactly when venue wifi is busiest.
 */
export function LivePresenceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [me, setMe] = useState<MyPresence | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await getPresence(pv());
      setSession(r.session ?? null);
      setMe(r.me ?? null);
    } catch {
      // A dropped poll must not blank what is already on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo<Live>(() => ({ session, me, loading, refresh }), [session, me, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLivePresence = () => useContext(Ctx);