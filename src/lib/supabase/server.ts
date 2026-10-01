import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers.
 *
 * It carries the caller's JWT, so every query it makes is subject to RLS. This
 * is the only client application code should use for reads and writes.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so skipping the write here is safe.
        }
      },
    },
  });
}

/**
 * The authenticated user, or null. Centralised so no component reaches into
 * auth internals directly.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Requires an authenticated user; redirects to sign-in if there isn't one. */
export async function requireUser(returnTo: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  // `redirect` returns never, so this is unreachable. The throw satisfies the
  // compiler without a non-null assertion, and keeps the failure loud if the
  // behaviour of `redirect` ever changes.
  throw new Error('requireUser reached without a session');
}