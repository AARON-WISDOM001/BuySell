'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/components/cart/cart-context';

/**
 * Empties the cart once the order is confirmed.
 *
 * A ref guard makes this idempotent, so a refresh of the confirmation page
 * cannot wipe a cart the shopper has since started building again.
 */
export function ClearCartOnMount() {
  const { clear, isEmpty } = useCart();
  const hasCleared = useRef(false);

  useEffect(() => {
    if (hasCleared.current) return;
    hasCleared.current = true;
    if (!isEmpty) clear();
  }, [clear, isEmpty]);

  return null;
}
