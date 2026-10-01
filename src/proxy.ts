import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Supabase session refresh.
 *
 * In Next.js 16 middleware is called `proxy` (the behaviour is unchanged, only
 * the filename and export name moved). This is the one place that can refresh
 * an expiring session, because Server Components get read-only cookies.
 *
 * This is deliberately NOT an authorization boundary. It cannot see the
 * database and must not be trusted to protect a route — `requireUser()` in
 * lib/supabase/server.ts does the real check on every protected page, and RLS
 * does the real enforcement on every query.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // A checkout with no Supabase credentials should render the setup screen,
  // not crash the proxy. createServerClient throws on an undefined URL, and a
  // throw here takes down every route including the one explaining the problem.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the JWT with the auth server rather than decoding it,
  // so a revoked token cannot ride along on a stale cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation output. Auth
     * cookies must be refreshed on any route that renders authenticated UI.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};