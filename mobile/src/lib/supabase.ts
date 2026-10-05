import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * The Supabase client, pointed at the same project the website uses.
 *
 * There is deliberately no second database and no second set of accounts: a
 * shopper who signs in on the phone is the same `auth.users` row as the shopper
 * who signs in on the site, and the cart rows they share are joined by that id.
 *
 * Only the publishable key is used. It is designed to ship inside an app and is
 * not a credential -- access is decided by the RLS policies that the session's
 * JWT carries, not by the key. The secret key bypasses RLS and must never appear
 * in a client of any kind.
 *
 * Session storage comes from expo-sqlite rather than AsyncStorage: it is what
 * Expo's own Supabase guide uses, and it keeps the token off an unencrypted
 * key-value store.
 */

// Referenced with dot notation on purpose. Expo inlines EXPO_PUBLIC_* variables
// at bundle time only when they are written as `process.env.NAME`; a computed
// lookup such as process.env[name] would silently bundle as undefined.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is missing. Copy mobile/.env.example to mobile/.env and fill it in. ` +
        'Both values are safe to ship in the app; never add the secret key here.',
    );
  }
  return value;
}

export const supabase = createClient(
  required(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  required(supabasePublishableKey, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps have no URL to read a session out of: the code arrives
      // through the deep-link handler instead.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Keep the access token fresh.
 *
 * Supabase refreshes on a timer, but a backgrounded app has its timers throttled,
 * so the shopper would return to a stale session. Reacting to the app becoming
 * active is what makes a session survive being backgrounded for an hour.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  stock_quantity: number;
};

const NGN_PER_USD = 1331.28;

const moneyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (cents: number): string => moneyFormatter.format((cents / 100) * NGN_PER_USD);

const storefrontOrigin = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://buysell-sigma.vercel.app';

export function resolveProductImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  try {
    return new URL(imageUrl, storefrontOrigin).toString();
  } catch {
    return imageUrl;
  }
}
