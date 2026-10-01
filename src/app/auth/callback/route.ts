import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Google OAuth callback.
 *
 * Supabase handles the token exchange; this route only completes the cookie
 * session and sends the shopper onward. The `code` query parameter is single-use
 * — it is exchanged here and then removed by redirecting without it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(`[auth] code exchange failed: ${error.message}`);
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
