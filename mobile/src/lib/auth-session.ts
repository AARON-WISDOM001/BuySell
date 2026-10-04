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

  if (error) return error;
  if (!accessToken || !refreshToken) return 'Sign-in did not return a session. Please try again.';

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return sessionError ? sessionError.message : null;
}