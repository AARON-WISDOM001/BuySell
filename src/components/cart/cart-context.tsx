'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  addLine,
  cartCount,
  changeQuantity,
  clearCart,
  isCartEmpty,
  MAX_LINE_QUANTITY,
  removeLine,
  setQuantity,
  type CartLine,
} from '@/lib/cart';
import {
  getCartSnapshot,
  getServerCartSnapshot,
  subscribeToCart,
  writeCart,
} from '@/lib/cart-storage';

/**
 * Client cart state, persisted to localStorage.
 *
 * The cart survives sign-in and sign-out on purpose. A shopper who adds items,
 * is asked to authenticate at checkout, and then signs in must come back to the
 * cart they were building — losing it is the single most common way these flows
 * feel hostile. Orders clear the cart explicitly, and nothing else does.
 *
 * Only ids and quantities are stored. Prices are never persisted client-side.
 */

export type CartContextValue = {
  lines: CartLine[];
  count: number;
  isEmpty: boolean;
  /** False until localStorage has been read, so the badge never flashes 0. */
  isReady: boolean;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  changeQuantity: (productId: string, delta: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  /** The last product added, for the transient "added" confirmation. */
  lastAdded: string | null;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // The cart lives in localStorage and is read through an external store, so
  // there is no hydrate-on-mount effect and no flash of a wrong count: the
  // server renders empty, the client re-renders with the stored cart before
  // paint.
  const lines = useSyncExternalStore(subscribeToCart, getCartSnapshot, getServerCartSnapshot);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const add = useCallback((productId: string, quantity = 1) => {
    writeCart(addLine(getCartSnapshot(), productId, quantity));
    setLastAdded(productId);
  }, []);

  const clear = useCallback(() => {
    writeCart(clearCart());
    setLastAdded(null);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: cartCount(lines),
      isEmpty: isCartEmpty(lines),
      // With useSyncExternalStore the snapshot is already correct on first
      // client render, so there is no separate "hydrated" flag to expose.
      isReady: true,
      add,
      setQuantity: (productId, quantity) =>
        writeCart(setQuantity(getCartSnapshot(), productId, quantity)),
      changeQuantity: (productId, delta) =>
        writeCart(changeQuantity(getCartSnapshot(), productId, delta)),
      remove: (productId) => writeCart(removeLine(getCartSnapshot(), productId)),
      clear,
      lastAdded,
    }),
    [lines, add, clear, lastAdded],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}

export { MAX_LINE_QUANTITY };
