/**
 * Cart arithmetic. Pure functions only — no React, no storage, no database.
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

/** Total number of individual units in the cart, for the header badge. */
export function cartCount(cart: CartLine[]): number {
  return cart.reduce((total, line) => total + line.quantity, 0);
}

export function isCartEmpty(cart: CartLine[]): boolean {
  return cart.length === 0;
}

/** A product-shaped view of a cart line, joined with live database data. */
export type PricedLine = {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  stockQuantity: number;
};

export type CartTotals = {
  subtotalCents: number;
  totalUnits: number;
  /** Lines whose quantity now exceeds available stock. */
  overStockLines: PricedLine[];
};

/**
 * Price up a cart against current product data.
 *
 * This is a *display* calculation. The authoritative total is computed inside
 * place_order() from the database, and the checkout action never sends a total
 * to the server — it sends ids and quantities only.
 */
export function priceCart(lines: PricedLine[]): CartTotals {
  const subtotalCents = lines.reduce(
    (total, line) => total + line.unitPriceCents * line.quantity,
    0,
  );

  return {
    subtotalCents,
    totalUnits: lines.reduce((total, line) => total + line.quantity, 0),
    overStockLines: lines.filter((line) => line.quantity > line.stockQuantity),
  };
}