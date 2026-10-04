import { isAuthCallbackUrl } from '@/lib/auth-callback';
import { createSessionFromUrl } from '@/lib/auth-session';

/**
 * Rewrite incoming native deep links before the first screen mounts.
 *
 * Expo Router assumes every incoming URL names a screen. The OAuth callback does
 * not name a screen -- it carries tokens back from the browser -- so without this
 * the router hunts for a route called `auth/callback`, finds none, and renders
 * "Unmatched Route" instead of the shopper's account.
 *
 * Storing the session is what signs the shopper in; `onAuthStateChange` in
 * SessionProvider picks them up from there. Returning '/' is just what stops the
 * router navigating to a route that does not exist.
 *
 * Must never throw. This runs on the launch path with no error boundary above
 * it, and a crash here is a crash before the app has drawn anything.
 */
export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    if (isAuthCallbackUrl(path)) {
      await createSessionFromUrl(path);
      return '/';
    }

    return path;
  } catch {
    return '/';
  }
}