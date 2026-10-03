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
const OWNER_KEY = 'buysell.cart.owner.v1';

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

/**
 * Replace the stored cart and notify every subscriber in this tab.
 *
 * `push: false` marks a write that originated *from* the account cart — a
 * realtime event or the result of a merge — so it is not echoed straight back to
 * the server. Without it a realtime delivery would re-push itself and the two
 * devices would trade the same change back and forth forever.
 */
export function writeCart(lines: CartLine[], options: { push?: boolean } = {}): void {
  cache = lines;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Quota exceeded or storage disabled. The cart still works for this
    // session, it just will not survive a reload.
  }
  emit();
  if (options.push !== false) remoteWriter?.(lines);
}

/**
 * The account this stored cart belongs to, or null when it is a guest cart.
 *
 * Without this, signing out of one account and into another on the same browser
 * would merge the first account's cart into the second one's. The cart is only
 * ids and quantities so nothing sensitive leaks, but the shopper would find
 * items in their new cart that they never put there.
 */
export function getCartOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function setCartOwner(userId: string | null): void {
  try {
    if (userId) window.localStorage.setItem(OWNER_KEY, userId);
    else window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // Storage disabled. The cart still works for this session.
  }
}

/**
 * Where local cart writes go once the shopper is signed in.
 *
 * Registered by the sync layer rather than imported here, so this module stays
 * free of any Supabase dependency and remains usable — and testable — with the
 * cart alone.
 */
type RemoteWriter = (lines: CartLine[]) => void;

let remoteWriter: RemoteWriter | null = null;

export function setRemoteWriter(writer: RemoteWriter | null): void {
  remoteWriter = writer;
}
