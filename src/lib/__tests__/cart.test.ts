import { describe, expect, it } from 'vitest';
import {
  MAX_LINE_QUANTITY,
  MAX_LINES,
  addLine,
  cartCount,
  changeQuantity,
  clearCart,
  isCartEmpty,
  normalizeCart,
  priceCart,
  removeLine,
  setQuantity,
  type CartLine,
  type PricedLine,
} from '@/lib/cart';

const line = (productId: string, quantity: number): CartLine => ({ productId, quantity });

const product = (
  productId: string,
  unitPriceCents: number,
  stockQuantity: number,
  quantity: number,
): PricedLine => ({
  productId,
  name: `Product ${productId}`,
  slug: productId,
  imageUrl: `/products/${productId}.svg`,
  unitPriceCents,
  quantity,
  stockQuantity,
});

describe('cart quantity rules', () => {
  it('adds a new line when the product is not in the cart', () => {
    expect(addLine([], 'a', 1)).toEqual([line('a', 1)]);
  });

  it('accumulates quantity on an existing line', () => {
    expect(addLine([line('a', 2)], 'a', 3)).toEqual([line('a', 5)]);
  });

  it('never exceeds the per-line maximum, however many times add is called', () => {
    let cart: CartLine[] = [];
    for (let i = 0; i < 50; i += 1) cart = addLine(cart, 'a', 10);
    expect(cart[0].quantity).toBe(MAX_LINE_QUANTITY);
  });

  it('refuses to grow past the line cap when adding a new product', () => {
    const full: CartLine[] = Array.from({ length: MAX_LINES }, (_, i) =>
      line(`p${i}`, 1),
    );
    expect(addLine(full, 'overflow', 1)).toHaveLength(MAX_LINES);
  });

  it('clamps a single add above the cap', () => {
    expect(addLine([], 'a', 999)).toEqual([line('a', MAX_LINE_QUANTITY)]);
  });

  it('clamps non-integer and non-finite quantities instead of trusting them', () => {
    expect(addLine([], 'a', 2.7)).toEqual([line('a', 2)]);
    expect(addLine([], 'a', Number.NaN)).toEqual([line('a', 1)]);
    expect(addLine([], 'a', Number.POSITIVE_INFINITY)).toEqual([line('a', 1)]);
  });

  it('ignores a negative quantity rather than creating a corrupt line', () => {
    expect(addLine([], 'a', -5)).toEqual([line('a', 1)]);
  });
});

describe('setQuantity', () => {
  it('sets an absolute quantity', () => {
    expect(setQuantity([line('a', 2)], 'a', 7)).toEqual([line('a', 7)]);
  });

  it('clamps above the maximum', () => {
    expect(setQuantity([line('a', 2)], 'a', 500)).toEqual([
      line('a', MAX_LINE_QUANTITY),
    ]);
  });

  it('removes the line when the quantity drops below one', () => {
    expect(setQuantity([line('a', 2), line('b', 1)], 'a', 0)).toEqual([line('b', 1)]);
  });

  it('leaves other lines untouched', () => {
    expect(setQuantity([line('a', 2), line('b', 3)], 'a', 1)).toEqual([
      line('a', 1),
      line('b', 3),
    ]);
  });

  it('is a no-op for a product that is not in the cart', () => {
    expect(setQuantity([line('a', 2)], 'zzz', 4)).toEqual([line('a', 2)]);
  });
});

describe('changeQuantity', () => {
  it('increments and decrements', () => {
    expect(changeQuantity([line('a', 2)], 'a', 1)).toEqual([line('a', 3)]);
    expect(changeQuantity([line('a', 2)], 'a', -1)).toEqual([line('a', 1)]);
  });

  it('stops at 1 rather than going negative, so the stepper cannot silently delete', () => {
    expect(changeQuantity([line('a', 1)], 'a', -1)).toEqual([line('a', 1)]);
  });

  it('stops at the maximum', () => {
    expect(changeQuantity([line('a', MAX_LINE_QUANTITY)], 'a', 1)).toEqual([
      line('a', MAX_LINE_QUANTITY),
    ]);
  });

  it('ignores an unknown product', () => {
    expect(changeQuantity([line('a', 2)], 'b', 1)).toEqual([line('a', 2)]);
  });
});

describe('removeLine / clearCart', () => {
  it('removes only the requested product', () => {
    expect(removeLine([line('a', 1), line('b', 2)], 'a')).toEqual([line('b', 2)]);
  });

  it('is a no-op when the product is absent', () => {
    expect(removeLine([line('a', 1)], 'b')).toEqual([line('a', 1)]);
  });

  it('clears everything', () => {
    expect(clearCart()).toEqual([]);
    expect(isCartEmpty(clearCart())).toBe(true);
  });
});

describe('cartCount', () => {
  it('sums units across lines, not distinct lines', () => {
    expect(cartCount([line('a', 2), line('b', 3)])).toBe(5);
  });

  it('is zero for an empty cart', () => {
    expect(cartCount([])).toBe(0);
  });
});

describe('normalizeCart (untrusted localStorage input)', () => {
  it('rejects a non-array', () => {
    expect(normalizeCart(null)).toEqual([]);
    expect(normalizeCart('nope')).toEqual([]);
    expect(normalizeCart(42)).toEqual([]);
  });

  it('drops entries without a usable product id', () => {
    expect(normalizeCart([{ quantity: 2 }, { productId: '', quantity: 1 }])).toEqual([]);
  });

  it('clamps hostile quantities', () => {
    expect(normalizeCart([{ productId: 'a', quantity: 9999 }])).toEqual([
      line('a', MAX_LINE_QUANTITY),
    ]);
    expect(normalizeCart([{ productId: 'a', quantity: -3 }])).toEqual([line('a', 1)]);
    expect(normalizeCart([{ productId: 'a', quantity: 'lots' }])).toEqual([line('a', 1)]);
  });

  it('de-duplicates repeated product ids', () => {
    expect(normalizeCart([{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 4 }]))
      .toEqual([line('a', 1)]);
  });

  it('caps the number of lines', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    expect(normalizeCart(many)).toHaveLength(MAX_LINES);
  });

  it('passes valid data through unchanged', () => {
    expect(normalizeCart([{ productId: 'a', quantity: 3 }])).toEqual([line('a', 3)]);
  });
});

describe('priceCart', () => {
  it('computes subtotal from unit price times quantity', () => {
    const totals = priceCart([product('a', 24900, 10, 2), product('b', 8900, 10, 1)]);
    expect(totals.subtotalCents).toBe(24900 * 2 + 8900);
    expect(totals.totalUnits).toBe(3);
  });

  it('is zero for an empty cart', () => {
    expect(priceCart([])).toEqual({
      subtotalCents: 0,
      totalUnits: 0,
      overStockLines: [],
    });
  });

  it('flags lines that exceed available stock', () => {
    const totals = priceCart([product('a', 1000, 2, 5), product('b', 1000, 10, 1)]);
    expect(totals.overStockLines.map((l) => l.productId)).toEqual(['a']);
  });

  it('flags a line when stock is exactly zero', () => {
    expect(priceCart([product('a', 1000, 0, 1)]).overStockLines).toHaveLength(1);
  });

  it('does not flag a line at exactly the available quantity', () => {
    expect(priceCart([product('a', 1000, 3, 3)]).overStockLines).toEqual([]);
  });

  it('keeps arithmetic in integer cents', () => {
    const totals = priceCart([product('a', 1999, 10, 3)]);
    expect(Number.isInteger(totals.subtotalCents)).toBe(true);
    expect(totals.subtotalCents).toBe(5997);
  });
});