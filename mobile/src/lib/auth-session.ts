import { parseCallback } from '@/lib/auth-callback';
import { supabase } from '@/lib/supabase';

/**
 * Turn a callback URL into a stored session.
 *
 * This is the only place tokens become a session. The browser-session
 * continuation, the warm-start Linking listener and the cold-start
 * `+native-intent` handler all funnel through it, so a callback cannot succeed
 * on one path and fail on another.
 *
 * Returns a shopper-readable error, or null on success. Logging the raw provider
 * detail is the caller's job; the shopper gets the short version.
 */
export async function createSessionFromUrl(url: string): Promise<string | null> {
  const { error, accessToken, refreshToken } = parseCallback(url);

  // Confirms the session the cart depends on actually exists. `userId: null`
  // here means every cart push silently degrades to local-only.
  console.log('[DIAG] auth callback', {
    host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return '(unparseable)';
      }
    })(),
    providerError: error,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    fragmentKeys: (url.split('#')[1] ?? '')
      .split('&')
      .map((pair) => pair.split('=')[0])
      .filter(Boolean),
    queryKeys: (() => {
      const q = url.split('#')[0].split('?')[1] ?? '';
      return q.split('&').map((pair) => pair.split('=')[0]).filter(Boolean);
    })(),
  });

  if (error) return error;
  if (!accessToken || !refreshToken) return 'Sign-in did not return a session. Please try again.';

  const { error: sessionError, data } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  console.log('[DIAG] auth setSession', {
    ok: !sessionError,
    error: sessionError?.message ?? null,
    userId: data.user?.id ?? null,
    email: data.user?.email ?? null,
  });

  return sessionError ? sessionError.message : null;
}