'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/** Only allow same-origin relative paths, so `?next=` cannot be used as an open redirect. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value : '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/**
 * Start Google OAuth.
 *
 * Supabase owns the token exchange — we never handle Google tokens directly.
 * `redirectTo` is the URL Google returns to, which must also be registered in
 * the Supabase Auth redirect allowlist (see README).
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeReturnTo(formData.get('next'));
  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=oauth&next=${encodeURIComponent(next)}`);
  }

  redirect(data.url);
}

/** Sign out and drop the cart-derived session state, then return home. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}