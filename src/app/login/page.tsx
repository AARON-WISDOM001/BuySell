import type { Metadata } from 'next';
import Link from 'next/link';
import { signInWithGoogle } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Container, Notice } from '@/components/ui/layout';
import { storeName } from '@/lib/env';

export const metadata: Metadata = { title: 'Sign in' };

/** Only same-origin relative paths, so `?next=` cannot become an open redirect. */
function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const oauthFailed = params.error === 'oauth';
  const misconfigured = params.error === 'config';

  return (
    <Container size="narrow" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {storeName()} uses your Google account for orders only. There is no password to remember
          and nothing to lose if you stop using it.
        </p>

        {misconfigured ? (
          <div className="mt-8">
            <Notice tone="danger" title="This site is not fully configured">
              Sign-in is unavailable because the site address is missing or invalid. If that is
              unexpected, this is a deployment problem — set the public site URL and try again.
            </Notice>
          </div>
        ) : oauthFailed ? (
          <div className="mt-8">
            <Notice tone="danger" title="Sign-in did not complete">
              Google did not return us to the site. This is usually a redirect URL that has not been
              registered yet — check the Supabase and Google OAuth configuration, then try again.
            </Notice>
          </div>
        ) : null}

        <form action={signInWithGoogle} className="mt-8">
          <input type="hidden" name="next" value={next} />
          <Button type="submit" size="lg" className="w-full">
            <GoogleMark />
            Continue with Google
          </Button>
        </form>

        <ul className="mt-8 space-y-2.5 text-[13px] leading-relaxed text-ink-muted">
          <li>We only read your name, email address, and profile picture.</li>
          <li>We never post to your account or contact your contacts.</li>
          <li>Your cart survives signing in and out.</li>
        </ul>

        <p className="mt-10 text-sm">
          <Link href="/" className="text-ink-soft underline underline-offset-4 hover:text-ink">
            Continue shopping without signing in
          </Link>
        </p>
      </div>
    </Container>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
