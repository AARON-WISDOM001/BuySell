'use client';

import { useCart } from '@/components/cart/cart-context';
import { CART_SYNC_COPY, type CartSyncStatus } from '@/lib/cart-server';

/**
 * The dot carries the state for a scanning eye; the words carry it for anyone
 * who needs to know *why* their cart is or isn't on the other device.
 */
const DOT_TONE: Record<CartSyncStatus, string> = {
  local: 'bg-ink-muted',
  unavailable: 'bg-danger',
  synced: 'bg-success',
  error: 'bg-danger',
};

export function CartSyncBadge() {
  const { syncStatus } = useCart();
  const copy = CART_SYNC_COPY[syncStatus];

  return (
    <span
      role="status"
      title={copy.detail}
      className="inline-flex items-center gap-1.5 rounded-xs border border-line bg-surface px-2 py-1 text-[11px] whitespace-nowrap text-ink-soft"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[syncStatus]}`} />
      {copy.label}
    </span>
  );
}
