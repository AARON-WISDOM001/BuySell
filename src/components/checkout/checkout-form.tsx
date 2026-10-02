'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/components/cart/cart-context';
import { priceCartAction, type PricedCartResponse } from '@/app/actions/cart';
import { placeOrder } from '@/app/actions/orders';
import { initialOrderState, type OrderActionState } from '@/lib/validation';
import { signInWithGoogle } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Container, DataRow, Notice } from '@/components/ui/layout';
import { formatCents } from '@/lib/money';
import { FREE_SHIPPING_THRESHOLD_CENTS, STANDARD_SHIPPING_CENTS } from '@/lib/env';

/**
 * Checkout.
 *
 * Submitting posts product ids and quantities. Prices are never in the payload:
 * the server reads them from the database inside place_order(), so this form
 * has no field a user could alter to change what they are charged.
 */
export function CheckoutForm({
  isAuthenticated,
  next,
}: {
  isAuthenticated: boolean;
  next: string;
}) {
  const { lines, isReady } = useCart();
  const [priced, setPriced] = useState<PricedCartResponse | null>(null);
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(
    placeOrder,
    initialOrderState,
  );

  const summaryRef = useRef<HTMLDivElement>(null);
  const signature = lines.map((line) => `${line.productId}:${line.quantity}`).join(',');

  useEffect(() => {
    if (!isReady || lines.length === 0) return;
    let active = true;
    priceCartAction(lines).then((result) => {
      if (active) setPriced(result);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isReady]);

  // Move focus to the error summary after a failed submit, so a keyboard or
  // screen-reader user is taken to the problem instead of left at the button.
  useEffect(() => {
    if (state.status === 'error' && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [state]);

  if (!isReady) {
    return (
      <Container className="py-16">
        <div className="h-8 w-48 animate-pulse bg-line" />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="h-96 border border-line bg-surface" />
          <div className="h-72 border border-line bg-surface" />
        </div>
      </Container>
    );
  }

  if (lines.length === 0) {
    return (
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-md border border-line bg-surface px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">There is nothing to check out</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Your cart is empty. Add something first.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center rounded-xs bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink-soft"
          >
            Browse the catalogue
          </Link>
        </div>
      </Container>
    );
  }

  const shipping = priced
    ? priced.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
      ? 0
      : STANDARD_SHIPPING_CENTS
    : 0;

  const blocked = !priced || priced.overStock.length > 0 || priced.unavailable.length > 0;

  if (!isAuthenticated) {
    return (
      <Container size="narrow" className="py-16 sm:py-24">
        <div className="mx-auto max-w-lg border border-line bg-surface px-6 py-12 text-center sm:px-10">
          <h1 className="text-2xl font-semibold">Sign in to place your order</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Your cart is saved. Signing in keeps everything exactly where it is — you will come
            straight back to this page.
          </p>

          <form action={signInWithGoogle} className="mt-8">
            <input type="hidden" name="next" value={next} />
            <Button type="submit" size="lg" className="w-full">
              <GoogleMark />
              Continue with Google
            </Button>
          </form>

          <p className="mt-6 text-[13px] text-ink-muted">
            We only use your name and email to confirm the order. No password, no marketing list.
          </p>

          <Link
            href="/cart"
            className="mt-6 inline-block text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
          >
            Back to cart
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold">Checkout</h1>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
        Confirm where this should go. No payment is taken now — we will get in touch to arrange it.
      </p>

      <form action={formAction} className="mt-10">
        {/* The cart travels as ids and quantities only. */}
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(lines.map((line) => ({ productId: line.productId, quantity: line.quantity })))}
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div>
            {state.status === 'error' ? (
              <div
                ref={summaryRef}
                tabIndex={-1}
                role="alert"
                aria-labelledby="checkout-error-title"
                className="mb-8 rounded-xs border border-danger-soft bg-danger-soft px-5 py-4 focus-visible:outline-2 focus-visible:outline-danger"
              >
                <h2 id="checkout-error-title" className="text-sm font-semibold text-danger">
                  There is a problem
                </h2>
                {state.errors?.length ? (
                  <ul className="mt-2 space-y-1">
                    {state.errors.map((error) => (
                      <li key={`${error.field}-${error.message}`} className="text-[13px]">
                        <a
                          href={`#field-${error.field}`}
                          className="text-danger underline underline-offset-2"
                        >
                          {error.message}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[13px] text-danger">{state.message}</p>
                )}
              </div>
            ) : null}

            <fieldset className="border-0 p-0">
              <legend className="mb-6 text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                Contact
              </legend>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Full name"
                  name="customerName"
                  autoComplete="name"
                  required
                  error={state.fieldErrors?.customerName}
                />
                <Field
                  label="Email"
                  name="customerEmail"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  hint="Order confirmation goes here."
                  error={state.fieldErrors?.customerEmail}
                />
              </div>

              <div className="mt-5">
                <Field
                  label="Phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  hint="Only if you would rather we called about delivery."
                  error={state.fieldErrors?.phone}
                />
              </div>
            </fieldset>

            <fieldset className="mt-10 border-0 p-0">
              <legend className="mb-6 text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                Shipping address
              </legend>

              <div className="grid gap-5 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <Field
                    label="Street address"
                    name="shippingAddress"
                    autoComplete="address-line1"
                    required
                    error={state.fieldErrors?.shippingAddress}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Field
                    label="City"
                    name="city"
                    autoComplete="address-level2"
                    required
                    error={state.fieldErrors?.city}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Field
                    label="State / region"
                    name="state"
                    autoComplete="address-level1"
                    required
                    error={state.fieldErrors?.state}
                  />
                </div>
                <div className="sm:col-span-6">
                  <Field
                    label="Country"
                    name="country"
                    autoComplete="country-name"
                    required
                    error={state.fieldErrors?.country}
                  />
                </div>
              </div>
            </fieldset>

            <div className="mt-8">
              <Notice tone="warning" title="No payment is collected here">
                Placing this order reserves your items and records it as awaiting payment. We will
                contact you to arrange payment before dispatch.
              </Notice>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-surface p-6">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                Order summary
              </h2>

              <ul className="mt-4 space-y-4 border-b border-line pb-5">
                {(priced?.lines ?? []).map((line) => (
                  <li key={line.productId} className="flex items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xs border border-line bg-canvas">
                      <Image src={line.imageUrl} alt="" fill sizes="56px" className="object-cover" />
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold tabular-nums text-white">
                        {line.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{line.name}</p>
                      <p className="text-[13px] tabular-nums text-ink-muted">
                        {formatCents(line.unitPriceCents)} each
                      </p>
                    </div>
                    <p className="text-[13px] tabular-nums text-ink">
                      {formatCents(line.unitPriceCents * line.quantity)}
                    </p>
                  </li>
                ))}
                {!priced ? (
                  <li className="text-[13px] text-ink-muted">Calculating…</li>
                ) : null}
              </ul>

              <dl className="mt-5">
                <DataRow
                  label="Subtotal"
                  value={priced ? formatCents(priced.subtotalCents) : '—'}
                />
                <DataRow
                  label="Shipping"
                  value={priced ? (shipping === 0 ? 'Free' : formatCents(shipping)) : '—'}
                />
                <div className="my-3 border-t border-line" />
                <DataRow
                  label="Total"
                  emphasis
                  value={priced ? formatCents(priced.subtotalCents + shipping) : '—'}
                />
              </dl>

              {priced && priced.overStock.length > 0 ? (
                <p className="mt-4 text-[13px] text-danger">
                  Reduce the highlighted quantities in your cart before placing this order.
                </p>
              ) : null}

              <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending || blocked}>
                {pending ? 'Placing order…' : 'Place order'}
              </Button>

              <p className="mt-3 text-center text-[13px] text-ink-muted" role="status">
                {pending ? 'Creating your order and sending confirmation.' : ''}
              </p>

              <Link
                href="/cart"
                className="mt-3 flex h-10 w-full items-center justify-center text-sm text-ink-soft transition-colors hover:text-ink"
              >
                Back to cart
              </Link>
            </div>
          </aside>
        </div>
      </form>
    </Container>
  );
}

/** Google's mark, drawn inline so it matches Google's brand guidelines. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
