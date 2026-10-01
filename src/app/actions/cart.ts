'use server';

import { getProductsByIds } from '@/lib/catalog';
import { normalizeCart, priceCart, type CartLine, type PricedLine } from '@/lib/cart';

/**
 * Price a client-side cart against live product data.
 *
 * The cart itself only holds ids and quantities, so pricing has to happen where
 * the database is reachable. This action returns nothing the client supplied —
 * it takes ids and quantities, reads the current product rows, and returns what
 * the database says, including a fresh stock level.
 *
 * Products that have been removed or deleted are returned in `unavailable`
 * rather than silently dropped, so the UI can explain the change instead of
 * quietly shrinking the cart.
 */

export type PricedCartResponse = {
  lines: PricedLine[];
  /** Ids the shopper has that no longer resolve to a product. */
  unavailable: string[];
  subtotalCents: number;
  totalUnits: number;
  /** Ids whose quantity now exceeds available stock. */
  overStock: string[];
};

const EMPTY: PricedCartResponse = {
  lines: [],
  unavailable: [],
  subtotalCents: 0,
  totalUnits: 0,
  overStock: [],
};

export async function priceCartAction(rawLines: CartLine[]): Promise<PricedCartResponse> {
  const lines = normalizeCart(rawLines);
  if (lines.length === 0) return EMPTY;

  const products = await getProductsByIds(lines.map((line) => line.productId));

  const priced: PricedLine[] = [];
  const unavailable: string[] = [];

  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) {
      unavailable.push(line.productId);
      continue;
    }

    priced.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.imageUrl,
      // From the database, never from the cart.
      unitPriceCents: product.priceCents,
      quantity: line.quantity,
      stockQuantity: product.stockQuantity,
    });
  }

  const totals = priceCart(priced);

  return {
    lines: priced,
    unavailable,
    subtotalCents: totals.subtotalCents,
    totalUnits: totals.totalUnits,
    overStock: totals.overStockLines.map((line) => line.productId),
  };
}
