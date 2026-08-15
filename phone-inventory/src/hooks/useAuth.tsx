import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  clearOAuthUrlParams,
  createSupabaseClient,
  isSupabaseConfigured,
  signInWithGitHub as oauthSignInWithGitHub,
  signOut as oauthSignOut,
} from '../lib/supabase';

interface AuthContextValue {
  /** True while resolving initial session / OAuth callback. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  /** When false, cloud auth is skipped (localStorage fallback). */
  cloudAuthRequired: boolean;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cloudAuthRequired = isSupabaseConfigured();
  const [loading, setLoading] = useState(cloudAuthRequired);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudAuthRequired) {
      setLoading(false);
      return;
    }

    const supabase = createSupabaseClient();
    let cancelled = false;

    void (async () => {
      try {
        // getSession() also completes PKCE exchange when detectSessionInUrl is on.
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) {
          setError(sessionError.message);
          setSession(null);
        } else {
          setSession(data.session);
          if (data.session) clearOAuthUrlParams();
        }

        const params = new URLSearchParams(window.location.search);
        const oauthError =
          params.get('error_description') || params.get('error');
        if (oauthError) {
          setError(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
          clearOAuthUrlParams();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Nie udało się odczytać sesji.',
          );
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        clearOAuthUrlParams();
        setError(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [cloudAuthRequired]);

  const signInWithGitHub = useCallback(async () => {
    setError(null);
    try {
      await oauthSignInWithGitHub();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się rozpocząć logowania.',
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await oauthSignOut();
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wylogować.');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      error,
      cloudAuthRequired,
      signInWithGitHub,
      signOut,
      clearError: () => setError(null),
    }),
    [
      loading,
      session,
      error,
      cloudAuthRequired,
      signInWithGitHub,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
