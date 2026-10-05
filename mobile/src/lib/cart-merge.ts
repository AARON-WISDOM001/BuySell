import { mergeCartLines, type CartLine } from './cart-rules';

/**
 * Decide what the cart should be when an account signs in on this device.
 *
 * The device cart is what the shopper built while signed out, so normally it
 * folds into the account cart rather than replacing it — discarding it is the
 * most common way a cart feels broken immediately after signing in.
 *
 * The exception is a cart left behind by a *different* account, which is
 * replaced outright. Merging there would hand one shopper's picks to the next
 * person to sign in on the same phone. `owner` is the account the local cart
 * belongs to, and it deliberately survives sign-out, which is what makes that
 * distinction possible; the website clears it instead and so leaks.
 *
 * Pure, so the decision is testable without a device.
 */
export function cartForSignIn(
  device: CartLine[],
  server: CartLine[],
  owner: string | null,
  userId: string,
): CartLine[] {
  if (owner !== null && owner !== userId) return server;
  return mergeCartLines(device, server);
}