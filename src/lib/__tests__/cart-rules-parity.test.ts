import { describe, expect, it } from 'vitest';

import * as web from '@/lib/cart';
import * as mobile from '../../../mobile/src/lib/cart-rules';

/**
 * The phone carries its own copy of the cart rules (mobile/src/lib/cart-rules.ts)
 * because EAS Build uploads only mobile/ and cannot reach the web app's
 * src/lib/cart.ts. See that file's header for the full reasoning.
 *
 * Two copies of a rule set is only safe if something fails when they disagree,
 * which is what this file is. It runs both implementations over the same inputs
 * — including hostile ones — and asserts identical output.
 *
 * The fixtures below are object-shaped on purpose. normalizeCart reads
 * `{ productId, quantity }` by property name, so an array like `['a', 1]`
 * destructures to `undefined` and normalizes away to an empty cart. An earlier
 * version of this file used arrays, every fixture silently became `[]`, and all
 * of these assertions passed while testing nothing at all.
 */

const line = (productId: string, quantity: number) => ({ productId, quantity });

const ids = ['a', 'b', 'c', 'd'];

const carts: web.CartLine[][] = [
  [],
  [line('a', 1)],
  [line('a', 2), line('b', 10)],
  [line('a', 10), line('b', 1), line('c', 5)],
  // Past the per-line ceiling.
  [line('a', 11), line('b', 999)],
  // Zero and negative, which clampQuantity must pull back up to 1.
  [line('a', 0), line('b', -4)],
  // Fractional, which must truncate rather than round.
  [line('a', 2.9), line('b', 1.5)],
  // Non-finite, which must become 1.
  [line('a', Number.NaN), line('b', Number.POSITIVE_INFINITY)],
  // Same product twice: first occurrence wins, second is dropped.
  [line('a', 1), line('a', 7)],
];

/** Raw junk, for normalizeCart only — none of this is a valid cart. */
const junk: unknown[] = [
  'not a cart',
  null,
  undefined,
  42,
  [{ nope: true }],
  [{ productId: '' }],
  [{ quantity: 3 }],
  ['a', 1],
  [null],
  { productId: 'a' },
];

const amounts = [
  -5, -1, 0, 0.4, 1, 1.9, 5, 9, 10, 11, 100,
  Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];

describe('cart rules parity between web and mobile', () => {
  it('is not testing empty carts by accident', () => {
    // Guards the mistake described in the file header: if the fixtures stop being
    // valid CartLine objects, everything below silently becomes a test of [].
    expect(web.normalizeCart([line('a', 2)])).toEqual([line('a', 2)]);
    expect(web.normalizeCart(carts[2])).toHaveLength(2);
    expect(web.normalizeCart(junk[0])).toEqual([]);
  });

  it('agrees on the ceilings', () => {
    expect(mobile.MAX_LINE_QUANTITY).toBe(web.MAX_LINE_QUANTITY);
    expect(mobile.MAX_LINES).toBe(web.MAX_LINES);
  });

  it('normalizes junk identically', () => {
    for (const input of junk) {
      expect(mobile.normalizeCart(input)).toEqual(web.normalizeCart(input));
    }
    for (const cart of carts) {
      expect(mobile.normalizeCart(cart)).toEqual(web.normalizeCart(cart));
    }
  });

  it('adds lines identically', () => {
    for (const base of carts) {
      for (const id of ids) {
        for (const amount of amounts) {
          expect(mobile.addLine(base, id, amount)).toEqual(
            web.addLine(base, id, amount),
          );
        }
      }
    }
  });

  it('sets quantities identically', () => {
    for (const base of carts) {
      for (const id of ids) {
        for (const amount of amounts) {
          expect(mobile.setQuantity(base, id, amount)).toEqual(
            web.setQuantity(base, id, amount),
          );
        }
      }
    }
  });

  it('changes quantities identically', () => {
    for (const base of carts) {
      for (const id of ids) {
        for (const delta of amounts) {
          expect(mobile.changeQuantity(base, id, delta)).toEqual(
            web.changeQuantity(base, id, delta),
          );
        }
      }
    }
  });

  it('removes, clears and counts identically', () => {
    for (const base of carts) {
      for (const id of ids) {
        expect(mobile.removeLine(base, id)).toEqual(web.removeLine(base, id));
      }
      expect(mobile.clearCart()).toEqual(web.clearCart());
      expect(mobile.cartCount(base)).toBe(web.cartCount(base));
      expect(mobile.isCartEmpty(base)).toBe(web.isCartEmpty(base));
    }
  });

  it('merges a guest cart into an account cart identically', () => {
    for (const device of carts) {
      for (const server of carts) {
        expect(mobile.mergeCartLines(device, server)).toEqual(
          web.mergeCartLines(device, server),
        );
      }
    }
  });

  it('resolves a conflict on a product present on both sides the same way', () => {
    // The rule that matters most on a sign-in, and the one the array-shaped
    // fixtures used to miss entirely: the account quantity wins, it is not
    // summed and it is not overwritten by the device.
    const device = [line('a', 1)];
    const server = [line('a', 4), line('b', 2)];

    expect(web.mergeCartLines(device, server)).toEqual([line('a', 4), line('b', 2)]);
    expect(mobile.mergeCartLines(device, server)).toEqual(
      web.mergeCartLines(device, server),
    );

    // Summed instead of server-wins is the tempting wrong answer.
    expect(web.mergeCartLines(device, server)[0].quantity).toBe(4);
  });

  it('never lets a merge exceed the line ceiling', () => {
    const big = Array.from({ length: web.MAX_LINES + 20 }, (_, i) => line(`p${i}`, 1));
    const merged = mobile.mergeCartLines(big, [line('z', 2)]);
    expect(merged.length).toBeLessThanOrEqual(mobile.MAX_LINES);
    expect(merged).toEqual(web.mergeCartLines(big, [line('z', 2)]));
  });

  it('truncates an oversized cart on its own, not only via merge', () => {
    // mergeCartLines carries a second ceiling that would mask a missing cap in
    // normalizeCart, so the cap has to be asserted directly or it is untested.
    const big = Array.from({ length: web.MAX_LINES + 20 }, (_, i) => line(`p${i}`, 1));

    expect(web.normalizeCart(big)).toHaveLength(web.MAX_LINES);
    expect(mobile.normalizeCart(big)).toHaveLength(mobile.MAX_LINES);
    expect(mobile.normalizeCart(big)).toEqual(web.normalizeCart(big));
  });
});