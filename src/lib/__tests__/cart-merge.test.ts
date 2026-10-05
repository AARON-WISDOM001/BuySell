import { describe, expect, it } from 'vitest';

import { cartForSignIn } from '../../../mobile/src/lib/cart-merge';
import type { CartLine } from '../../../mobile/src/lib/cart-rules';

/**
 * What the cart becomes when an account signs in on the phone.
 *
 * Two failure modes are being kept apart here, and they pull in opposite
 * directions. Folding the device cart in is right when the shopper built it —
 * losing it right after sign-in is the bug that makes these flows feel hostile.
 * Folding it in when a *different* account signs in hands one shopper's picks to
 * the next person to use the phone, which is worse than losing a cart.
 */

const line = (productId: string, quantity: number): CartLine => ({ productId, quantity });
const qty = (cart: CartLine[], productId: string): number | undefined =>
  cart.find((entry) => entry.productId === productId)?.quantity;

describe('cartForSignIn', () => {
  it('folds a guest cart into the account cart', () => {
    const merged = cartForSignIn([line('guest', 2)], [line('saved', 1)], null, 'user-a');

    expect(qty(merged, 'guest')).toBe(2);
    expect(qty(merged, 'saved')).toBe(1);
  });

  it('keeps the guest cart when the account cart is empty', () => {
    const merged = cartForSignIn([line('guest', 3)], [], null, 'user-a');

    expect(merged).toEqual([line('guest', 3)]);
  });

  it('leaves the account cart alone when the device has nothing', () => {
    const merged = cartForSignIn([], [line('saved', 1)], null, 'user-a');

    expect(merged).toEqual([line('saved', 1)]);
  });

  it('merges again for the account that already owns the cart', () => {
    // Signing out and back in must not drop what this shopper was holding.
    const merged = cartForSignIn([line('mine', 1)], [line('saved', 1)], 'user-a', 'user-a');

    expect(qty(merged, 'mine')).toBe(1);
    expect(qty(merged, 'saved')).toBe(1);
  });

  it('never hands one account’s cart to another', () => {
    const merged = cartForSignIn(
      [line('user-a-pick', 4)],
      [line('user-b-pick', 1)],
      'user-a',
      'user-b',
    );

    expect(merged).toEqual([line('user-b-pick', 1)]);
    expect(qty(merged, 'user-a-pick')).toBeUndefined();
  });

  it('lets the server win on a product both sides hold', () => {
    // The account cart is the authority on what it already contains, so a stale
    // device quantity must not silently overwrite the shopper's other device.
    const merged = cartForSignIn([line('shared', 9)], [line('shared', 2)], null, 'user-a');

    expect(qty(merged, 'shared')).toBe(2);
  });
});