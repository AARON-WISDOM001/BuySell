/**
 * Money handling.
 *
 * Prices are integer cents everywhere — in Postgres, in the cart, in order
 * rows, and in email bodies. Floats are never used for money; the only place a
 * decimal point appears is this formatter.
 */

export const CURRENCY = 'USD';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
});

/** 24900 -> "$249.00" */
export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** For inputs and anywhere a bare number is wanted: 24900 -> "249.00" */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}