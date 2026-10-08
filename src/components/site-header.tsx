import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { LogOut, UserRound } from 'lucide-react';
import { CartButton } from '@/components/cart/cart-button';
import { CartSyncBadge } from '@/components/cart/cart-sync-badge';
import { NavLinks } from '@/components/nav-links';
import { ThemeToggle } from '@/components/theme-toggle';
import { storeName } from '@/lib/env';
import { signOut } from '@/app/actions/auth';

/**
 * Site header. A Server Component, because it reads the session — the auth
 * state is rendered on the server and never fetched from the client.
 *
 * Mobile navigation is a horizontally scrollable row rather than a hamburger:
 * there are three destinations, and a disclosure menu that hides three links
 * behind an extra tap is worse on both counts.
 */
export function SiteHeader({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-5 sm:h-16 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="wordmark shrink-0 text-[13px] font-semibold text-ink sm:text-sm"
        >
          {storeName()}
        </Link>

        <NavLinks className="hidden min-w-0 flex-1 sm:block" />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <form action="/" role="search" className="hidden md:block">
            <label htmlFor="header-search" className="focusable-sr-only">
              Search products
            </label>
            <input
              id="header-search"
              type="search"
              name="q"
              placeholder="Search"
              className="h-9 w-40 rounded-xs border border-line bg-surface px-3 text-sm placeholder:text-ink-muted transition-colors focus:border-line-strong lg:w-56"
            />
          </form>

          {user ? (
            <>
              <Link
                href="/account"
                className="hidden h-9 items-center gap-1.5 rounded-xs px-2 text-sm text-ink-soft transition-colors hover:bg-canvas hover:text-ink sm:inline-flex"
              >
                <UserRound size={16} strokeWidth={1.5} aria-hidden="true" />
                Account
              </Link>

              <form action={signOut} className="contents">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xs px-2 text-sm text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
                >
                  <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-xs border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              Sign in
            </Link>
          )}

          <ThemeToggle />
          <div className="hidden sm:block">
            <CartSyncBadge />
          </div>
          <CartButton />
        </div>
      </div>

      <div className="border-t border-line sm:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-5">
          <NavLinks />
          <form action="/" role="search" className="ml-auto">
            <label htmlFor="mobile-search" className="focusable-sr-only">
              Search products
            </label>
            <input
              id="mobile-search"
              type="search"
              name="q"
              placeholder="Search"
              className="h-9 w-28 rounded-xs border border-line bg-surface px-3 text-sm placeholder:text-ink-muted"
            />
          </form>
        </div>
      </div>
    </header>
  );
}
