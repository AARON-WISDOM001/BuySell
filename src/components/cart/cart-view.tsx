'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useCart } from '@/components/cart/cart-context';
import { CurrencyDisclosure, useCurrencyFormatter } from '@/components/currency-provider';
import { priceCartAction, type PricedCartResponse } from '@/app/actions/cart';
import { Button } from '@/components/ui/button';
import { QuantityStepper } from '@/components/product/add-to-cart';
import { Container, DataRow, PageHeader, Notice } from '@/components/ui/layout';
import { FREE_SHIPPING_THRESHOLD_CENTS, STANDARD_SHIPPING_CENTS } from '@/lib/env';

/**
 * Cart page.
 *
 * Quantities and ids come from localStorage, so the totals cannot be rendered
 * on the server. They are fetched from priceCartAction, which prices the cart
 * against the database — meaning what the customer sees and what the order will
 * be charged are computed by the same source, with a visible loading state in
 * between rather than a flash of a wrong number.
 */
export function CartView() {
  const { lines, isReady, remove, changeQuantity, clear } = useCart();
  const formatMoney = useCurrencyFormatter();
  const [pricedFor, setPricedFor] = useState<{
    signature: string;
    result: PricedCartResponse;
  } | null>(null);

  const signature = lines.map((line) => `${line.productId}:${line.quantity}`).join(',');

  useEffect(() => {
    if (!isReady) return;

    // The result is stored tagged with the signature it was priced for, so a
    // cart edit makes the old price stale immediately — which is what drives
    // the loading state. No separate `isPricing` flag to keep in sync.
    let active = true;

    priceCartAction(lines).then((result) => {
      if (!active) return;
      setPricedFor({ signature, result });
    });

    return () => {
      active = false;
    };
    // `signature` is the serialised form of `lines`; depending on `lines`
    // directly re-runs this on every reducer identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isReady]);

  const priced = pricedFor?.signature === signature ? pricedFor.result : null;

  if (!isReady) {
    return <CartSkeleton />;
  }

  if (lines.length === 0) {
    return (
      <Container className="py-16 sm:py-24">
        <div className="mx-auto max-w-md border border-line bg-surface px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Your cart is empty</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Nothing here yet. The catalogue is deliberately short — have a look.
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

  const blocked =
    !priced ||
    priced.lines.length === 0 ||
    priced.overStock.length > 0 ||
    priced.unavailable.length > 0;

  return (
    <Container className="py-12 sm:py-16">
      <PageHeader
        eyebrow="Your cart"
        title={`${priced?.totalUnits ?? lines.length} ${priced?.totalUnits === 1 ? 'item' : 'items'}`}
        action={
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear cart
          </Button>
        }
      />

      {priced && priced.unavailable.length > 0 ? (
        <div className="mt-6">
          <Notice tone="warning" title="Some items are no longer available">
            {priced.unavailable.length === 1
              ? 'One item in your cart has been withdrawn.'
              : `${priced.unavailable.length} items in your cart have been withdrawn.`}{' '}
            Remove {priced.unavailable.length === 1 ? 'it' : 'them'} to continue.
          </Notice>
        </div>
      ) : null}

      {priced && priced.overStock.length > 0 ? (
        <div className="mt-6">
          <Notice tone="warning" title="Not enough stock left">
            Some quantities exceed what we have on hand. Reduce them to continue.
          </Notice>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
        <div aria-busy={!priced}>
          <ul className="divide-y divide-line border-y border-line">
            {priced?.lines.map((line) => (
              <li key={line.productId} className="flex gap-4 py-6 sm:gap-6">
                <Link
                  href={`/products/${line.slug}`}
                  className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-xs border border-line bg-canvas sm:w-28"
                >
                  <Image
                    src={line.imageUrl}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${line.slug}`}
                        className="text-[15px] font-medium text-ink hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className="mt-1 text-[13px] tabular-nums text-ink-muted">
                        {formatMoney(line.unitPriceCents)} each
                      </p>
                      {line.quantity > line.stockQuantity ? (
                        <p className="mt-1 text-[13px] text-danger">
                          Only {line.stockQuantity} in stock
                        </p>
                      ) : null}
                    </div>

                    <p className="shrink-0 text-[15px] tabular-nums text-ink">
                      {formatMoney(line.unitPriceCents * line.quantity)}
                    </p>
                  </div>

                  <div className="mt-auto flex items-center gap-4">
                    <QuantityStepper
                      quantity={line.quantity}
                      max={Math.min(10, line.stockQuantity)}
                      size="sm"
                      onChange={(next) => changeQuantity(line.productId, next - line.quantity)}
                    />
                    <button
                      type="button"
                      onClick={() => remove(line.productId)}
                      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                      Remove
                      <span className="focusable-sr-only">{line.name}</span>
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {priced?.unavailable.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-4 border-b border-line py-5"
            >
              <p className="text-sm text-ink-muted">Unavailable item</p>
              <Button variant="danger" size="sm" onClick={() => remove(id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-line bg-surface p-6">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
              Summary
            </h2>

            <dl className="mt-4">
              <DataRow
                label="Subtotal"
                value={
                  priced ? (
                    formatMoney(priced.subtotalCents)
                  ) : (
                    <span className="inline-block h-4 w-16 bg-line" aria-label="Calculating" />
                  )
                }
              />
              <DataRow
                label="Shipping"
                value={
                  priced
                    ? shipping === 0
                      ? 'Free'
                      : formatMoney(shipping)
                    : (
                        <span className="inline-block h-4 w-10 bg-line" aria-label="Calculating" />
                      )
                }
              />
              <div className="my-3 border-t border-line" />
              <DataRow
                label="Total"
                emphasis
                value={
                  priced ? (
                    formatMoney(priced.subtotalCents + shipping)
                  ) : (
                    <span className="inline-block h-5 w-20 bg-line" aria-label="Calculating" />
                  )
                }
              />
            </dl>

            {priced && shipping > 0 ? (
              <p className="mt-3 text-[13px] text-ink-muted">
                Free shipping on orders over {formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)}.
              </p>
            ) : null}

            {priced ? <CurrencyDisclosure cents={priced.subtotalCents + shipping} /> : null}

            <Link
              href={blocked ? '/cart' : '/checkout'}
              aria-disabled={blocked}
              className={`mt-6 flex h-11 w-full items-center justify-center rounded-xs px-5 text-sm font-medium transition-colors ${
                blocked
                  ? 'pointer-events-none bg-line text-ink-muted'
                  : 'bg-ink text-white hover:bg-ink-soft'
              }`}
            >
              Proceed to checkout
            </Link>

            <Link
              href="/"
              className="mt-3 flex h-10 w-full items-center justify-center text-sm text-ink-soft transition-colors hover:text-ink"
            >
              Continue shopping
            </Link>

            {blocked ? (
              <p className="mt-3 text-center text-[13px] text-ink-muted">
                Resolve the items above to continue.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </Container>
  );
}

function CartSkeleton() {
  return (
    <Container className="py-12 sm:py-16" aria-busy="true">
      <p className="focusable-sr-only" role="status">
        Loading your cart
      </p>
      <div className="h-9 w-40 animate-pulse bg-line" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
        <div className="divide-y divide-line border-y border-line">
          {[0, 1].map((index) => (
            <div key={index} className="flex gap-6 py-6">
              <div className="h-24 w-24 shrink-0 bg-line" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 w-2/5 bg-line" />
                <div className="h-3 w-1/4 bg-line" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-64 border border-line bg-surface" />
      </div>
    </Container>
  );
}
