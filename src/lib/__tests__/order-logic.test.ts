import { describe, expect, it } from 'vitest';
import {
  cartSubmissionSchema,
  checkoutSchema,
  errorSummary,
  fieldErrors,
} from '@/lib/validation';
import {
  currencyForCountry,
  formatCents,
  formatCentsInCurrency,
  centsToDecimalString,
} from '@/lib/money';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  STANDARD_SHIPPING_CENTS,
  shippingFor,
} from '@/lib/env';

const validCheckout = {
  customerName: 'Alice Adams',
  customerEmail: 'alice@example.com',
  phone: '+1 555 0100',
  shippingAddress: '12 Alder Way',
  city: 'Portland',
  state: 'Oregon',
  country: 'United States',
};

const uuid = '11111111-1111-1111-1111-111111111111';

describe('checkoutSchema', () => {
  it('accepts a complete submission', () => {
    const result = checkoutSchema.safeParse(validCheckout);
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = checkoutSchema.safeParse({ ...validCheckout, city: '  Portland  ' });
    expect(result.success && result.data.city).toBe('Portland');
  });

  it('rejects a missing name', () => {
    const result = checkoutSchema.safeParse({ ...validCheckout, customerName: '' });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).customerName).toMatch(/required/i);
  });

  it('rejects a whitespace-only address', () => {
    const result = checkoutSchema.safeParse({ ...validCheckout, shippingAddress: '     ' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    for (const bad of ['not-an-email', 'a@b', '@example.com', 'alice@']) {
      expect(checkoutSchema.safeParse({ ...validCheckout, customerEmail: bad }).success).toBe(
        false,
      );
    }
  });

  it('rejects every missing required field at once, for the error summary', () => {
    const result = checkoutSchema.safeParse({});
    expect(result.success).toBe(false);
    const fields = errorSummary(result.error!).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'customerName',
        'customerEmail',
        'shippingAddress',
        'city',
        'state',
        'country',
      ]),
    );
  });

  it('treats phone as optional', () => {
    const { phone: _omitted, ...withoutPhone } = validCheckout;
    expect(checkoutSchema.safeParse(withoutPhone).success).toBe(true);
  });

  it('normalises an empty phone string to an empty string, not undefined', () => {
    const result = checkoutSchema.safeParse({ ...validCheckout, phone: '' });
    expect(result.success && result.data.phone).toBe('');
  });

  it('rejects an absurdly long field', () => {
    const result = checkoutSchema.safeParse({ ...validCheckout, city: 'x'.repeat(500) });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys rather than carrying them into the order', () => {
    const result = checkoutSchema.safeParse({
      ...validCheckout,
      total_cents: 1,
      user_id: uuid,
    });
    expect(result.success && result.data).not.toHaveProperty('total_cents');
    expect(result.success && result.data).not.toHaveProperty('user_id');
  });
});

describe('cartSubmissionSchema', () => {
  it('accepts a well-formed cart', () => {
    const result = cartSubmissionSchema.safeParse({
      items: [{ productId: uuid, quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty cart', () => {
    const result = cartSubmissionSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/empty/i);
  });

  it('rejects a non-uuid product id', () => {
    const result = cartSubmissionSchema.safeParse({
      items: [{ productId: '1 OR 1=1', quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer quantity', () => {
    const result = cartSubmissionSchema.safeParse({
      items: [{ productId: uuid, quantity: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero and negative quantities', () => {
    for (const quantity of [0, -1]) {
      expect(
        cartSubmissionSchema.safeParse({ items: [{ productId: uuid, quantity }] }).success,
      ).toBe(false);
    }
  });

  it('rejects a quantity above the per-line cap', () => {
    const result = cartSubmissionSchema.safeParse({
      items: [{ productId: uuid, quantity: 11 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a price field, because prices are never client input', () => {
    const result = cartSubmissionSchema.safeParse({
      items: [{ productId: uuid, quantity: 1, unitPriceCents: 1, stockQuantity: 99 }],
    });
    // Stripped rather than rejected — the values are simply not carried through.
    expect(result.success && result.data.items[0]).toEqual({
      productId: uuid,
      quantity: 1,
    });
  });
});

describe('money formatting', () => {
  it('formats integer cents as currency', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(24900)).toBe('$249.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('formats USD cents as naira using a display-only exchange rate', () => {
    expect(formatCentsInCurrency(24900, 'NGN', 1500, 'en-NG')).toBe('₦373,500');
  });

  it('selects currencies from country codes', () => {
    expect(currencyForCountry('NG')).toBe('NGN');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('XX')).toBe('USD');
  });

  it('converts cents to a decimal string without float drift', () => {
    expect(centsToDecimalString(24900)).toBe('249.00');
    expect(centsToDecimalString(1)).toBe('0.01');
  });
});

describe('shipping calculation (server-side only)', () => {
  it('is free above the threshold', () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS)).toBe(0);
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS + 1)).toBe(0);
  });

  it('charges standard shipping below the threshold', () => {
    expect(shippingFor(1)).toBe(STANDARD_SHIPPING_CENTS);
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS - 1)).toBe(STANDARD_SHIPPING_CENTS);
  });

  it('charges nothing for an empty cart', () => {
    expect(shippingFor(0)).toBe(0);
  });
});