/**
 * Cart arithmetic. Pure functions only — no React, no storage, no database.
 *
 * This is a deliberate copy of the web app's `src/lib/cart.ts`, minus the
 * pricing section (the phone computes its own subtotal for display).
 *
 * It used to import the web file directly via a `@shared/*` metro alias. That
 * works locally and it is the arrangement I would normally prefer, but EAS Build
 * uploads only this directory, so `../../src/lib/cart.ts` does not exist on the
 * build machine and Metro fails outright:
 *
 *   Failed to construct transformer: ENOENT: no such file or directory,
 *   stat '<build-root>/src/lib'
 *
 * The documented fix is npm workspaces, which Expo auto-detects. Converting the
 * repository would change how the deployed Next.js app installs its
 * dependencies, so that is a decision for the repo owner, not for a mobile
 * feature. Until then the rules live here.
 *
 * Drift between the two copies is caught by
 * `src/lib/__tests__/cart-rules-parity.test.ts`, which runs both modules over
 * the same inputs and asserts they agree. Change one and that test fails.
 *
 * The cart stores product ids and quantities and nothing else. It deliberately
 * does not store prices: a price is always joined from the database at read
 * time, so a stale or tampered client-side price cannot survive to checkout.
 */

export type CartLine = {
  productId: string;
  quantity: number;
};

/** Per-line ceiling, enforced in the UI and again in the database. */
export const MAX_LINE_QUANTITY = 10;
/** A cart with more distinct lines than this is treated as corrupt. */
export const MAX_LINES = 50;

/** Clamp a requested quantity into the valid range. */
function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

/** Coerce untrusted persisted data (localStorage) into a valid cart. */
export function normalizeCart(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const lines: CartLine[] = [];

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { productId, quantity } = raw as Record<string, unknown>;
    if (typeof productId !== 'string' || productId.length === 0) continue;
    if (seen.has(productId)) continue;

    seen.add(productId);
    lines.push({ productId, quantity: clampQuantity(Number(quantity)) });
    if (lines.length >= MAX_LINES) break;
  }

  return lines;
}

/**
 * Add to an existing line, or append a new one. Never exceeds
 * MAX_LINE_QUANTITY.
 */
export function addLine(
  cart: CartLine[],
  productId: string,
  quantity = 1,
): CartLine[] {
  const amount = clampQuantity(quantity);
  const existing = cart.find((line) => line.productId === productId);

  if (!existing) {
    if (cart.length >= MAX_LINES) return cart;
    return [...cart, { productId, quantity: amount }];
  }

  return cart.map((line) =>
    line.productId === productId
      ? { ...line, quantity: clampQuantity(line.quantity + amount) }
      : line,
  );
}

/** Set an absolute quantity. A quantity below 1 removes the line. */
export function setQuantity(
  cart: CartLine[],
  productId: string,
  quantity: number,
): CartLine[] {
  if (!Number.isFinite(quantity) || quantity < 1) {
    return removeLine(cart, productId);
  }
  return cart.map((line) =>
    line.productId === productId
      ? { ...line, quantity: clampQuantity(quantity) }
      : line,
  );
}

/**
 * Change by a signed delta, used by the quantity stepper. Never drops below 1,
 * because removing is an explicit action with its own control.
 */
export function changeQuantity(
  cart: CartLine[],
  productId: string,
  delta: number,
): CartLine[] {
  const existing = cart.find((line) => line.productId === productId);
  if (!existing) return cart;
  const next = existing.quantity + delta;
  // Clamped here rather than delegated to setQuantity, which removes the line
  // at 0 — the stepper must not be able to delete an item behind the user's back.
  return setQuantity(cart, productId, Math.max(1, next));
}

export function removeLine(cart: CartLine[], productId: string): CartLine[] {
  return cart.filter((line) => line.productId !== productId);
}

export function clearCart(): CartLine[] {
  return [];
}

/**
 * The ids present in `before` and absent from `after` — the removals a push is
 * allowed to delete on the account cart.
 *
 * This is the whole safety mechanism for two devices sharing one cart. A device
 * that has not yet seen the other device's realtime update still pushes its own
 * lines, but it only ever asks the server to delete ids it genuinely took out
 * itself. Deleting "everything the server holds that I do not have" instead makes
 * a stale view erase the other device's items, which is how the shared cart used
 * to lose products depending on who pushed last.
 */
export function removedIds(before: CartLine[], after: CartLine[]): string[] {
  const kept = new Set(after.map((line) => line.productId));
  return before.filter((line) => !kept.has(line.productId)).map((line) => line.productId);
}

/** Total number of individual units in the cart, for the header badge. */
export function cartCount(cart: CartLine[]): number {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

/**
 * Fold a device cart into the account cart at sign-in.
 *
 * A shopper who adds items while signed out and then authenticates must not
 * lose them, and must not lose an account cart they curated on another device
 * either — so lines are unioned rather than one side winning outright.
 *
 * Where the same product appears on both sides the server quantity wins. Adding
 * them instead would silently inflate a quantity the shopper may have set
 * deliberately, and the account cart is the one that other devices can see.
 */
export function mergeCartLines(device: CartLine[], server: CartLine[]): CartLine[] {
  // Normalizing the server side defends against a duplicate or out-of-range
  // row arriving from anywhere other than the constraint that should prevent it.
  const merged = normalizeCart(server);
  const taken = new Set(merged.map((line) => line.productId));

  for (const { productId, quantity } of normalizeCart(device)) {
    if (taken.has(productId)) continue; /* drift probe */
    if (merged.length >= MAX_LINES) break;
    taken.add(productId);
    merged.push({ productId, quantity });
  }

  return merged;
}

export function isCartEmpty(cart: CartLine[]): boolean {
  return cart.length === 0;
}