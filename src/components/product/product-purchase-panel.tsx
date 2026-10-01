'use client';

import { useState } from 'react';
import { QuantityStepper, AddToCartButton } from '@/components/product/add-to-cart';
import { MAX_LINE_QUANTITY } from '@/lib/cart';

/**
 * Product purchase panel.
 *
 * The quantity ceiling is capped at available stock as well as the global
 * maximum, so the stepper cannot offer a quantity the database would reject.
 */
export function ProductPurchasePanel({
  productId,
  productName,
  stockQuantity,
}: {
  productId: string;
  productName: string;
  stockQuantity: number;
}) {
  const ceiling = Math.max(1, Math.min(MAX_LINE_QUANTITY, stockQuantity));
  const [quantity, setQuantity] = useState(1);

  // If stock drops under the chosen quantity (another shopper buying the last
  // unit), pull the quantity back into range rather than submitting an
  // invalid order.
  const effective = Math.min(quantity, ceiling);
  const soldOut = stockQuantity === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-[13px] text-ink-muted">Quantity</span>
        <QuantityStepper
          quantity={effective}
          max={ceiling}
          onChange={setQuantity}
          disabled={soldOut}
        />
        {stockQuantity > 0 && stockQuantity <= 3 ? (
          <span className="text-[13px] text-accent">Only {stockQuantity} left</span>
        ) : null}
      </div>

      <AddToCartButton
        productId={productId}
        productName={productName}
        quantity={effective}
        maxQuantity={stockQuantity}
        disabled={soldOut}
        disabledReason={
          soldOut ? 'This item is sold out. Check back, or browse the rest of the catalogue.' : undefined
        }
      />
    </div>
  );
}
