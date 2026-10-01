'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Primary navigation.
 *
 * Client-side because it needs the current pathname to mark the active link.
 * Renders as a real <nav> with aria-current, so the active state is conveyed by
 * more than a colour difference.
 */

const links = [
  { href: '/', label: 'Shop' },
  { href: '/about', label: 'About' },
];

export function NavLinks({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get('category');

  return (
    <nav aria-label="Primary" className={className}>
      <ul className="flex items-center gap-1">
        {links.map((link) => {
          const isActive =
            link.href === '/'
              ? pathname === '/' || pathname.startsWith('/products')
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          // On the shop page the "Shop" link represents the current category
          // rather than the default listing.
          const href = link.href === '/' && category ? `/?category=${category}` : link.href;

          return (
            <li key={link.href}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex h-9 items-center border-b-2 px-3 text-sm transition-colors duration-150 ${
                  isActive
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-soft hover:border-line-strong hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
