import { describe, expect, it } from 'vitest';
import { addLine, MAX_LINES, MAX_LINE_QUANTITY, type CartLine } from '@/lib/cart';

/**
 * Quick Add calls `add`, which is `addLine` plus a storage write. These cover the
 * reason the UI checks the result instead of assuming success: `addLine` is a
 * silent no-op at the cart limits, so a click that changes nothing must not
 * report "Added".
 */
describe('quick add confirmation signal', () => {
  it('raises the line quantity, so the caller can confirm', () => {
    const before: CartLine[] = [{ productId: 'p1', quantity: 1 }];
    const after = addLine(before, 'p1', 1);
    const quantityOf = (lines: CartLine[], id: string) =>
      lines.find((line) => line.productId === id)?.quantity ?? 0;

    expect(quantityOf(after, 'p1')).toBeGreaterThan(quantityOf(before, 'p1'));
  });

  it('adds exactly one when the line is new', () => {
    expect(addLine([], 'p1', 1)).toEqual([{ productId: 'p1', quantity: 1 }]);
  });

  it('is a no-op at MAX_LINES, so the caller must not report success', () => {
    const full: CartLine[] = Array.from({ length: MAX_LINES }, (_, i) => ({
      productId: `p${i}`,
      quantity: 1,
    }));
    expect(addLine(full, 'new-product', 1)).toBe(full);
  });

  it('clamps at MAX_LINE_QUANTITY rather than exceeding it', () => {
    const atMax: CartLine[] = [{ productId: 'p1', quantity: MAX_LINE_QUANTITY }];
    expect(addLine(atMax, 'p1', 1)).toEqual([
      { productId: 'p1', quantity: MAX_LINE_QUANTITY },
    ]);
  });
});