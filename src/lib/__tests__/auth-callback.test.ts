import { describe, expect, it } from 'vitest';

import { isAuthCallbackUrl, parseCallback } from '../../../mobile/src/lib/auth-callback';

/**
 * The OAuth callback deep link is the one URL this app must recognise, and
 * failing to recognise it leaves the shopper silently signed out rather than
 * producing an obvious error.
 *
 * Both directions matter. A matcher that accepted everything would swallow
 * product deep links; one that accepted nothing would leave the router showing
 * "Unmatched Route". So each case below is asserted against both outcomes.
 */

describe('isAuthCallbackUrl', () => {
  it('accepts the callback in every shape it can arrive in', () => {
    expect(isAuthCallbackUrl('buysell://auth/callback')).toBe(true);
    expect(isAuthCallbackUrl('buysell://auth/callback?code=abc')).toBe(true);
    expect(isAuthCallbackUrl('buysell://auth/callback#access_token=a&refresh_token=b')).toBe(true);
    // Some platforms hand the router a bare path with no scheme.
    expect(isAuthCallbackUrl('auth/callback')).toBe(true);
    expect(isAuthCallbackUrl('/auth/callback')).toBe(true);
    // A device keyboard or adb can hand over surrounding whitespace.
    expect(isAuthCallbackUrl('  buysell://auth/callback  ')).toBe(true);
    expect(isAuthCallbackUrl('BUYSELL://auth/callback')).toBe(true);
  });

  it('rejects everything that is not the callback', () => {
    expect(isAuthCallbackUrl('buysell://product/42')).toBe(false);
    expect(isAuthCallbackUrl('buysell://cart')).toBe(false);
    expect(isAuthCallbackUrl('buysell://')).toBe(false);
    // A prefix match here would swallow a future route such as auth/callback/2fa.
    expect(isAuthCallbackUrl('buysell://auth/callbackXYZ')).toBe(false);
    expect(isAuthCallbackUrl('buysell://auth/callback-extra')).toBe(false);
    expect(isAuthCallbackUrl('https://buysell-sigma.vercel.app/auth/callback')).toBe(false);
    expect(isAuthCallbackUrl('')).toBe(false);
  });
});

describe('parseCallback', () => {
  it('reads an implicit-flow session out of the fragment', () => {
    const parsed = parseCallback(
      'buysell://auth/callback#access_token=at-123&refresh_token=rt-456&expires_in=3600&token_type=bearer&provider=google',
    );

    expect(parsed.error).toBeNull();
    expect(parsed.accessToken).toBe('at-123');
    expect(parsed.refreshToken).toBe('rt-456');
  });

  it('reads a session delivered in the query string instead', () => {
    const parsed = parseCallback('buysell://auth/callback?access_token=at-q&refresh_token=rt-q');

    expect(parsed.accessToken).toBe('at-q');
    expect(parsed.refreshToken).toBe('rt-q');
  });

  it('does not read the scheme and host as if they were parameters', () => {
    // url.slice(0, hashIndex) handed straight to URLSearchParams would parse
    // "buysell://auth/callback" as a parameter name and lose everything after.
    const parsed = parseCallback('buysell://auth/callback#access_token=at-1&refresh_token=rt-1');

    expect(parsed.accessToken).toBe('at-1');
    expect(parsed.refreshToken).toBe('rt-1');
  });

  it('surfaces a provider refusal as the shopper-readable description', () => {
    expect(
      parseCallback('buysell://auth/callback?error=access_denied&error_description=User+denied+access')
        .error,
    ).toBe('User denied access');
    expect(parseCallback('buysell://auth/callback?error=server_error').error).toBe('server_error');
  });

  it('reports no tokens for a callback that never returned any', () => {
    const parsed = parseCallback('buysell://auth/callback');

    expect(parsed.error).toBeNull();
    expect(parsed.accessToken).toBeNull();
    expect(parsed.refreshToken).toBeNull();
  });

  it('treats a half-returned session as no session', () => {
    // setSession with one token throws rather than signing anyone in, so the
    // guard must reject this before it reaches Supabase.
    const parsed = parseCallback('buysell://auth/callback#access_token=at-only');

    expect(parsed.refreshToken).toBeNull();
  });
});