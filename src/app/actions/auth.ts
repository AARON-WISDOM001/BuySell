'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { publicOrigin } from '@/lib/env';

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
 *
 * Fails closed when the public origin is missing or not an absolute URL. Sending
 * a relative `redirect_uri` anyway lets Supabase resolve it against its own Site
 * URL, so the shopper returns to the wrong host with no useful error. Better to
 * say the deployment is misconfigured.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeReturnTo(formData.get('next'));
  const supabase = await createClient();
  const origin = publicOrigin();

  if (!origin) {
    console.error(
      '[auth] NEXT_PUBLIC_SITE_URL is missing or not an absolute http(s) URL; refusing to start OAuth',
    );
    redirect(`/login?error=config&next=${encodeURIComponent(next)}`);
  }

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