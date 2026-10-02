'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { useCart } from '@/components/cart/cart-context';
import { getCartSnapshot } from '@/lib/cart-storage';

/**
 * Quick Add.
 *
 * Adds straight to the cart through the existing `useCart().add`, so the badge,
 * the stored lines, and the cart page all update from one source. There is no
 * second cart path here.
 *
 * Sits outside the card's product link in the price row, so activating it can
 * never navigate: there is no click to stop propagating.
 *
 * `add` is synchronous, but it can be a silent no-op — `addLine` returns the
 * cart unchanged once MAX_LINES is reached, and `writeCart` swallows storage
 * failures. So the confirmation is earned by comparing the line quantity
 * before and after the write rather than assuming it landed.
 */
export function QuickAdd({
  productId,
  productName,
  maxQuantity,
  disabled = false,
  className = '',
}: {
  productId: string;
  productName: string;
  maxQuantity: number;
  disabled?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const [state, setState] = useState<'idle' | 'added' | 'error'>('idle');
  const timer = useRef<number | null>(null);

  const blocked = disabled || maxQuantity === 0;

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function settle(next: 'added' | 'error') {
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), next === 'added' ? 2000 : 3200);
  }

  function handleAdd() {
    if (blocked) return;

    const before = quantityOf(productId);
    add(productId, 1);
    // Read the snapshot after the write rather than reusing the `lines` prop,
    // which still holds the value from before this click. A line already at
    // MAX_LINE_QUANTITY also reads unchanged, which is the second way this can
    // legitimately not add, so both surface as the same honest failure.
    if (quantityOf(productId) > before) settle('added');
    else settle('error');
  }

  function quantityOf(id: string) {
    return getCartSnapshot().find((line) => line.productId === id)?.quantity ?? 0;
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleAdd}
        disabled={blocked}
        aria-label={state === 'added' ? `${productName} added to cart` : `Add ${productName} to cart`}
        className="inline-flex h-8 items-center gap-1.5 rounded-xs border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-ink hover:bg-canvas disabled:pointer-events-none disabled:opacity-45"
      >
        {state === 'error' ? (
          <TriangleAlert size={14} strokeWidth={1.75} className="text-danger" aria-hidden="true" />
        ) : state === 'added' ? (
          <Check size={14} strokeWidth={2} className="text-success" aria-hidden="true" />
        ) : (
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        )}
        <span className="tabular-nums">
          {state === 'error' ? 'Could not add' : state === 'added' ? 'Added' : 'Add'}
        </span>
      </button>

      <p className="focusable-sr-only" role="status" aria-live="polite">
        {state === 'added'
          ? `${productName} added to cart`
          : state === 'error'
            ? `Could not add ${productName} to cart. Your cart is unchanged.`
            : ''}
      </p>
    </div>
  );
}