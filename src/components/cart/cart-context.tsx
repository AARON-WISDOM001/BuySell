'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  mergeCartLines,
  removeLine,
  removedIds,
  setQuantity,
  type CartLine,
} from '@/lib/cart';
import {
  getCartOwner,
  getCartSnapshot,
  getServerCartSnapshot,
  setCartOwner,
  setRemoteWriter,
  subscribeToCart,
  writeCart,
} from '@/lib/cart-storage';
import {
  fetchServerCart,
  pushServerCart,
  subscribeServerCart,
  type CartSyncStatus,
} from '@/lib/cart-server';
import { publicEnvOrNull } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

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
  /**
   * Where this cart lives. `local` while signed out, `unavailable` when the
   * environment is missing, `synced` once attached, `error` after a failed
   * push or pull. The cart page and header render it — every one of those
   * states looks like a working cart without the badge.
   */
  syncStatus: CartSyncStatus;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // The cart lives in localStorage and is read through an external store, so
  // there is no hydrate-on-mount effect and no flash of a wrong count: the
  // server renders empty, the client re-renders with the stored cart before
  // paint.
  const lines = useSyncExternalStore(subscribeToCart, getCartSnapshot, getServerCartSnapshot);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CartSyncStatus>('local');
  // Derived at render from a pure env read. Setting this inside the effect was
  // a cascading render, which react-hooks/set-state-in-effect rightly rejects.
  const envMissing = publicEnvOrNull() === null;

  /**
   * Bind the cart to the account once the shopper is signed in.
   *
   * The localStorage cart is not thrown away. It is what the shopper built while
   * signed out, and it is also what makes the cart survive a reload before this
   * effect has run — so it folds into the account cart rather than replacing it.
   */
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return () => {};

    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let attachedUser: string | null = null;

    /**
     * A failed push must not fail the interaction that triggered it. The local
     * mirror already holds the shopper's intent, and the next sign-in or reload
     * reconciles it, so the only thing to do is record it.
     */
    function quietly(promise: Promise<unknown>): void {
      void promise
        .then(() => {
          if (!disposed) setSyncStatus('synced');
        })
        .catch((error) => {
          console.error('cart sync failed', error);
          if (!disposed) setSyncStatus('error');
        });
    }

    async function attach(userId: string) {
      const server = await fetchServerCart(userId);
      if (disposed || attachedUser !== userId) return;

      // A cart belonging to a different account is replaced, not merged. Merging
      // would hand one shopper's picks to another on a shared browser.
      const owner = getCartOwner();
      const sameCart = owner === null || owner === userId;
      const merged = sameCart ? mergeCartLines(getCartSnapshot(), server ?? []) : (server ?? []);

      setCartOwner(userId);
      writeCart(merged, { push: false });

      // Push what the device had that the account cart lacked, so the other
      // devices see the merge too. Server quantities already win, so this is a
      // no-op for anything both sides had. Nothing is removed: a merge only ever
      // adds.
      if (sameCart) quietly(pushServerCart(userId, merged, []));
      if (disposed || attachedUser !== userId) return;

      /**
       * Adopt server state, but only when it genuinely differs from what this
       * tab holds. A poll landing between a tap and its push would otherwise
       * undo the tap.
       */
      const applyIncoming = (incoming: CartLine[], why: string) => {
        if (disposed || attachedUser !== userId) return;
        if (JSON.stringify(incoming) === JSON.stringify(getCartSnapshot())) return;
        console.log('[DIAG] refresh', { userId, why, adopted: incoming.length });
        writeCart(incoming, { push: false });
      };

      unsubscribe = subscribeServerCart(userId, (incoming) =>
        applyIncoming(incoming, 'realtime'),
      );

      // Realtime is best-effort and has been observed not to deliver. A short
      // poll while the tab is visible makes both directions converge within a
      // few seconds regardless, which is what the cross-platform cart requires.
      // ponytail: 4s forever while visible. Slow it to 15s and add a
      // visibilitychange read if the read quota ever becomes a concern.
      poll = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void fetchServerCart(userId)
          .then((incoming) => {
            if (disposed) return;
            if (incoming) applyIncoming(incoming, 'poll');
            setSyncStatus('synced');
          })
          .catch((error) => {
            console.error('cart sync failed', error);
            if (!disposed) setSyncStatus('error');
          });
      }, 4000);
    }

    function detach() {
      unsubscribe?.();
      unsubscribe = null;
      if (poll !== null) clearInterval(poll);
      poll = null;
      attachedUser = null;
      setRemoteWriter(null);
      // Ownership is cleared rather than the cart: the cart survives sign-out on
      // purpose, and the next shopper to sign in merges their own into it.
      setCartOwner(null);
      // Unmount already disposed, so this only fires on a real detach.
      if (!disposed) setSyncStatus('local');
    }

    function sync(userId: string | null) {
      // onAuthStateChange also fires for a token refresh, roughly hourly. Rebuilding
      // the subscription on each one would re-merge the cart for no reason.
      if (userId === attachedUser) return;

      detach();
      if (!userId) return;

      attachedUser = userId;
      // The remote writer is installed, so writes reach the account cart from
      // here on — that is what `synced` claims, not the completion of the pull.
      setRemoteWriter((lines, removed) => quietly(pushServerCart(userId, lines, removed)));
      setSyncStatus('synced');
      quietly(attach(userId));
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      sync(data.session?.user.id ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      sync(session?.user.id ?? null);
    });

    return () => {
      disposed = true;
      detach();
      subscription.subscription.unsubscribe();
    };
  }, []);

  const add = useCallback((productId: string, quantity = 1) => {
    writeCart(addLine(getCartSnapshot(), productId, quantity));
    setLastAdded(productId);
  }, []);

  const clear = useCallback(() => {
    const before = getCartSnapshot();
    const after = clearCart();
    writeCart(after, { removed: removedIds(before, after) });
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
      // Only the ids this write actually removed are deleted on the account
      // cart. Removing used to push a wholesale replace, so it also deleted
      // whatever another device had added.
      remove: (productId) => {
        const before = getCartSnapshot();
        const after = removeLine(before, productId);
        writeCart(after, { removed: removedIds(before, after) });
      },
      clear,
      lastAdded,
      syncStatus: envMissing ? 'unavailable' : syncStatus,
    }),
    [lines, add, clear, lastAdded, syncStatus, envMissing],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}

export { MAX_LINE_QUANTITY };
