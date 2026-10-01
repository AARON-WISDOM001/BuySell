import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Browser Supabase client.
 *
 * Uses the publishable key only. The secret key bypasses RLS and must never
 * appear in a bundle — this is the single place a browser client is created, so
 * there is no opportunity to pass the wrong key.
 */
export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}