import Link from 'next/link';

/**
 * Shown when required environment variables are absent.
 *
 * Deliberately specific: naming the missing variable and pointing at the exact
 * file to copy is faster than a generic "configuration error".
 */
export function NotConfigured({ missingVariable }: { missingVariable: string }) {
  const variable = missingVariable.replace('Missing environment variable ', '').split('.')[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Setup required
      </p>
      <h1 className="mt-3 text-3xl font-semibold">Connect Supabase to continue</h1>

      <p className="mt-4 leading-relaxed text-ink-soft">
        This storefront reads its catalogue and orders from Supabase, so it needs to know where
        your project lives. No request has been made to any external service.
      </p>

      <div className="mt-8 rounded-xs border border-line bg-surface p-5">
        <p className="text-sm font-medium">Missing variable</p>
        <code className="mt-1.5 block text-[13px] text-danger">{variable}</code>
      </div>

      <div className="mt-6 space-y-3 text-sm leading-relaxed text-ink-soft">
        <p>Three steps:</p>
        <ol className="list-inside list-decimal space-y-2">
          <li>
            Copy <code className="text-[13px]">.env.example</code> to{' '}
            <code className="text-[13px]">.env.local</code>.
          </li>
          <li>
            Fill in <code className="text-[13px]">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-[13px]">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> from your
            Supabase project settings, then run{' '}
            <code className="text-[13px]">supabase/migrations/0001_init.sql</code> in the SQL
            editor.
          </li>
          <li>Restart <code className="text-[13px]">npm run dev</code>.</li>
        </ol>
      </div>

      <p className="mt-8 text-sm">
        <Link href="/" className="text-ink underline underline-offset-4">
          Retry
        </Link>
      </p>
    </main>
  );
}
