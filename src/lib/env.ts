/**
 * Environment access.
 *
 * Two rules this file exists to enforce:
 *  1. NEXT_PUBLIC_* values are the only ones that may ever reach the browser.
 *  2. Every read is lazy, so `next build` still succeeds when a value is
 *     absent. Production deploys inject real values; local builds without a
 *     .env.local should not crash the compiler.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

/** Public browser-safe config. Publishable key only — never the secret key. */
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
    supabasePublishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  };
}

/** Mailgun config. Server-only; never import this from a client component. */
export function mailgunEnv() {
  return {
    apiKey: required('MAILGUN_API_KEY'),
    domain: required('MAILGUN_DOMAIN'),
    fromEmail: required('MAILGUN_FROM_EMAIL'),
  };
}

/** Public origin, used for OAuth redirects and links inside emails. */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')
  );
}

/**
 * Is this an origin we can safely send a user to?
 *
 * Only absolute http(s) URLs pass. A relative or empty value would be handed to
 * Supabase as `redirect_uri`, which resolves it against its own Site URL and
 * bounces the shopper to the wrong host — or nowhere. `javascript:` and
 * `data:` are rejected for the same reason: this value ends up in a redirect.
 */
export function isPublicOrigin(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * The configured public origin, or null when it is missing or malformed.
 *
 * Separate from `siteUrl()` on purpose: that one falls back to localhost so
 * email links still render during local development. A sign-in redirect has a
 * stricter requirement — it must name the real host — so it uses this and fails
 * closed instead of guessing.
 */
export function publicOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!isPublicOrigin(raw)) return null;
  return (raw as string).replace(/\/$/, '');
}

export function storeName(): string {
  return process.env.NEXT_PUBLIC_STORE_NAME?.trim() || 'BuySell';
}

/** How much above the free-shipping threshold before we charge. */
export const FREE_SHIPPING_THRESHOLD_CENTS = 15000;
export const STANDARD_SHIPPING_CENTS = 900;

/**
 * Shipping is derived here on the server and passed into the database function,
 * where it is stored verbatim. A client cannot influence it: the checkout
 * action never accepts a shipping amount from the browser.
 */
export function shippingFor(subtotalCents: number): number {
  return subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : STANDARD_SHIPPING_CENTS;
}