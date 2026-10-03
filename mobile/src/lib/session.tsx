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
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

/**
 * Google sign-in, returning the session.
 *
 * The flow is the standard native OAuth loop: ask Supabase where to send the
 * shopper, open it in a real browser so Google never sees the app, then wait for
 * the deep link that carries the authorization code back.
 *
 * Requires a development build. Expo Go installs one fixed scheme and cannot be
 * given ours, so there is no URL it can redirect back to and the code has nowhere
 * to land -- Expo's docs are explicit that OAuth apps need a build for this.
 */

type SessionValue = {
  user: User | null;
  /** False until the stored session has been read, so the UI can hold still. */
  isReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Where Google sends the shopper back to.
 *
 * Must be registered verbatim as a redirect URL in the Supabase dashboard, or
 * Supabase refuses the authorize request before the shopper ever sees it.
 */
export function redirectUrl(): string {
  return Linking.createURL('auth/callback');
}

function useSupabaseSession(): { value: Session | null; ready: boolean } {
  const [state, setState] = useState<{ value: Session | null; ready: boolean }>({
    value: null,
    ready: false,
  });

  useEffect(() => {
    let active = true;

    // The stored session is read on mount so a returning shopper is still signed
    // in, rather than seeing a signed-out UI flash before the listener fires.
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ value: data.session, ready: true });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setState({ value: next, ready: true });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}

function useSessionActions(user: User | null) {
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setError(null);

    const { data, error: startError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl(),
        // The browser opens in a modal that sits over the app on iOS and cannot
        // be dismissed by a swipe, which strands anyone who declines.
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (startError) {
      setError(startError.message);
      return;
    }
    if (!data.url) {
      setError('Could not start sign-in. Please try again.');
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl());

    // A cancelled browser sheet is a normal outcome, not something to report.
    if (result.type !== 'success') return;

    const callbackUrl = result.url;
    const query = Linking.parse(callbackUrl).queryParams ?? {};
    if (query.error_description) {
      setError(String(query.error_description));
      return;
    }

    // Implicit flow: the tokens come back in the URL fragment, which
    // Linking.parse does not expose, so the fragment is read directly.
    const fragment = new URLSearchParams(callbackUrl.split('#')[1] ?? '');
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setError('Sign-in did not return a session. Please try again.');
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) setError(sessionError.message);
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
  }, []);

  return useMemo(() => ({ user, signIn, signOut, error }), [user, signIn, signOut, error]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { value, ready } = useSupabaseSession();
  const { user, signIn, signOut, error } = useSessionActions(value?.user ?? null);

  const contextValue = useMemo<SessionValue>(
    () => ({ user, isReady: ready, signIn, signOut, error }),
    [user, ready, signIn, signOut, error],
  );

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}
