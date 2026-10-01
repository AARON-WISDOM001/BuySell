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