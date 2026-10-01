'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/cart/cart-context';

/**
 * Cart indicator.
 *
 * The badge is a live region so a screen reader announces the count after an
 * add, and it renders nothing until localStorage has been read — otherwise the
 * count visibly jumps from 0 on every page load.
 */
export function CartButton() {
  const { count, isReady } = useCart();

  return (
    <Link
      href="/cart"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xs text-ink-soft transition-colors duration-150 hover:bg-canvas hover:text-ink"
      aria-label={isReady ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}
    >
      <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" />
      {isReady && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      <span className="focusable-sr-only" role="status" aria-live="polite">
        {isReady && count > 0 ? `${count} items in cart` : ''}
      </span>
    </Link>
  );
}
