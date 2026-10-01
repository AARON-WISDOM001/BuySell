'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';

/**
 * Route-level error boundary. Catches render and data-fetch failures so a
 * failed query never leaves a blank page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side detail is already logged where the error was thrown; this is
    // the browser-side breadcrumb, with no user data attached.
    console.error(error);
  }, [error]);

  return (
    <Container className="py-24 sm:py-32">
      <div className="mx-auto max-w-md border border-line bg-surface px-6 py-14 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We could not load this page. It is most likely a temporary problem on our side.
        </p>

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try again</Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xs border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            Back to the shop
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-[13px] text-ink-muted">Reference: {error.digest}</p>
        ) : null}
      </div>
    </Container>
  );
}
