'use client';

import { useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { useCart } from '@/components/cart/cart-context';
import { Button } from '@/components/ui/button';
import { MAX_LINE_QUANTITY } from '@/lib/cart';

/**
 * Quantity stepper.
 *
 * Two real buttons rather than an <input type="number">: they give a 44px
 * target, work with a screen reader as "decrease quantity", and cannot be
 * typed into an invalid state. The value is exposed as text so it is announced.
 */
export function QuantityStepper({
  quantity,
  max = MAX_LINE_QUANTITY,
  onChange,
  label = 'Quantity',
  size = 'md',
  disabled = false,
}: {
  quantity: number;
  max?: number;
  onChange: (next: number) => void;
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const dimensions = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const atMin = quantity <= 1;
  const atMax = quantity >= Math.min(max, MAX_LINE_QUANTITY);

  return (
    <div
      className="inline-flex items-center rounded-xs border border-line-strong bg-surface"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={disabled || atMin}
        className={`${dimensions} inline-flex items-center justify-center rounded-l-xs text-ink-soft transition-colors duration-150 hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-35`}
      >
        <Minus size={15} strokeWidth={1.5} aria-hidden="true" />
        <span className="focusable-sr-only">Decrease {label.toLowerCase()}</span>
      </button>

      <span
        className="flex min-w-9 items-center justify-center text-sm tabular-nums text-ink"
        aria-live="polite"
        aria-atomic="true"
      >
        {quantity}
        <span className="focusable-sr-only">{` ${label.toLowerCase()}`}</span>
      </span>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={disabled || atMax}
        className={`${dimensions} inline-flex items-center justify-center rounded-r-xs text-ink-soft transition-colors duration-150 hover:bg-canvas hover:text-ink disabled:pointer-events-none disabled:opacity-35`}
      >
        <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
        <span className="focusable-sr-only">Increase {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

/**
 * Add-to-cart control with a brief inline confirmation.
 *
 * Confirmation replaces the label in place instead of stacking a toast on top
 * of the layout: no reflow, no overlay, and the change is announced via the
 * status region rather than only being visible.
 */
export function AddToCartButton({
  productId,
  productName,
  maxQuantity,
  quantity,
  disabled = false,
  disabledReason,
  className = '',
}: {
  productId: string;
  productName: string;
  maxQuantity: number;
  quantity: number;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const { add } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  // `isEmpty` is deliberately absent here: an empty cart is the normal state
  // before the first add, not a reason to disable adding.
  const blocked = disabled || maxQuantity === 0;

  function handleAdd() {
    if (blocked) return;
    add(productId, quantity);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2200);
  }

  return (
    <div className={className}>
      <Button
        onClick={handleAdd}
        disabled={blocked}
        size="lg"
        className="w-full"
        aria-describedby={blocked && disabledReason ? 'add-to-cart-reason' : undefined}
      >
        {justAdded ? (
          <>
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            Added
          </>
        ) : (
          'Add to cart'
        )}
      </Button>

      <p className="focusable-sr-only" role="status" aria-live="polite">
        {justAdded ? `${productName} added to cart` : ''}
      </p>

      {blocked && disabledReason ? (
        <p id="add-to-cart-reason" className="mt-2 text-[13px] text-ink-muted">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
