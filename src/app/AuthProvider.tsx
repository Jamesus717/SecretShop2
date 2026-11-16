import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthState } from '../lib/authContext';
import { checkIsAdmin, getSession, profileFromUser, signInWithDiscord, signOutUser, upsertProfileFromSession } from '../lib/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const apply = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setIsAdmin(false); return; }
    setIsAdmin(await checkIsAdmin(s.user.id));
    try { await upsertProfileFromSession(s); } catch { /* cosmetic */ }
  }, []);

  useEffect(() => {
    let live = true;
    getSession()
      .then((s) => apply(s))
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_evt, next) => {
      // Defer: calling supabase inside this callback can deadlock the client.
      setTimeout(() => { if (live) void apply(next); }, 0);
    });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, [apply]);

  const value = useMemo<AuthState>(() => ({
    user: session?.user ?? null,
    profile: session ? profileFromUser(session.user) : null,
    isAdmin,
    loading,
    signIn: signInWithDiscord,
    signOut: signOutUser,
  }), [session, isAdmin, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
