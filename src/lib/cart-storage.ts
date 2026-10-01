'use client';

import { normalizeCart, type CartLine } from '@/lib/cart';

/**
 * localStorage as an external store.
 *
 * localStorage is a browser API, so reading it during render is exactly what
 * `useSyncExternalStore` is for: it subscribes on the client, returns the server
 * snapshot during SSR and hydration, and guarantees a referentially stable
 * value so React does not loop.
 *
 * The parsed value is cached because `getSnapshot` must return the *same*
 * reference when nothing has changed — a fresh `[]` every call would make
 * React believe the cart changed on every render.
 */

const STORAGE_KEY = 'buysell.cart.v1';

/** Stable reference so the server snapshot never looks like a change. */
const EMPTY: CartLine[] = [];

/** null means "not read yet". */
let cache: CartLine[] | null = null;

const listeners = new Set<() => void>();

function readStorage(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? normalizeCart(JSON.parse(raw)) : EMPTY;
  } catch {
    // Corrupt JSON, private mode, or storage disabled. An empty cart is a fine
    // outcome in all three cases.
    cache = EMPTY;
  }
  return cache;
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorageEvent(event: StorageEvent) {
  // Another tab wrote to the cart.
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  cache = null;
  emit();
}

export function subscribeToCart(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', onStorageEvent);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorageEvent);
  };
}

export function getCartSnapshot(): CartLine[] {
  return readStorage();
}

/** The server has no localStorage, so it always renders an empty cart. */
export function getServerCartSnapshot(): CartLine[] {
  return EMPTY;
}

/** Replace the stored cart and notify every subscriber in this tab. */
export function writeCart(lines: CartLine[]): void {
  cache = lines;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Quota exceeded or storage disabled. The cart still works for this
    // session, it just will not survive a reload.
  }
  emit();
}
