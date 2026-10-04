/**
 * Reading the Google OAuth callback URL.
 *
 * Deliberately pure -- no Expo, no Supabase -- so the logic that decides whether
 * a deep link is a sign-in result can be tested in plain Node. Turning those
 * tokens into a stored session lives in auth-session.ts.
 */

const AUTH_CALLBACK_PATTERN = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?auth\/callback(?:[/?#]|$)/i;

/**
 * Is this incoming URL the OAuth callback?
 *
 * Expo hands `+native-intent` a whole URL such as `buysell://auth/callback`, but
 * the router delivers routes with a leading slash and some platforms strip the
 * scheme entirely, so both are accepted. Product links and a lookalike such as
 * `auth/callbackXYZ` are deliberately not ours.
 */
export function isAuthCallbackUrl(url: string): boolean {
  return AUTH_CALLBACK_PATTERN.test(url.trim());
}

export type ParsedCallback = {
  /** Shopper-readable failure from the provider, or null if there was none. */
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

/**
 * Pull the session tokens out of a callback URL.
 *
 * Implicit flow returns them in the fragment, which `Linking.parse` does not
 * expose, so the fragment is read directly. The query string is accepted too:
 * it costs nothing and covers a provider that answers there instead.
 */
export function parseCallback(url: string): ParsedCallback {
  const trimmed = url.trim();
  const hashIndex = trimmed.indexOf('#');
  const beforeHash = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const fragment = new URLSearchParams(hashIndex === -1 ? '' : trimmed.slice(hashIndex + 1));

  const queryIndex = beforeHash.indexOf('?');
  const query = new URLSearchParams(queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1));

  return {
    error:
      query.get('error_description') ??
      query.get('error') ??
      fragment.get('error_description') ??
      fragment.get('error'),
    accessToken: fragment.get('access_token') ?? query.get('access_token'),
    refreshToken: fragment.get('refresh_token') ?? query.get('refresh_token'),
  };
}