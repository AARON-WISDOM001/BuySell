import Link from 'next/link';
import { storeName } from '@/lib/env';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-[13px] text-ink-muted">
          <span className="wordmark font-semibold text-ink-soft">{storeName()}</span>
          <span className="mx-2">·</span>
          Considered goods for work and home.
        </p>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <li>
              <Link href="/" className="text-ink-soft transition-colors hover:text-ink">
                Shop
              </Link>
            </li>
            <li>
              <Link href="/account" className="text-ink-soft transition-colors hover:text-ink">
                Account
              </Link>
            </li>
            <li>
              <Link href="/about" className="text-ink-soft transition-colors hover:text-ink">
                About
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
