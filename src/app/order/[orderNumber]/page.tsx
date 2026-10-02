import { notFound } from 'next/navigation';
import { createClient, requireUser } from '@/lib/supabase/server';
import { ClearCartOnMount } from '@/components/checkout/clear-cart-on-mount';
import { resendOrderEmail } from '@/app/actions/orders';
import { Container, DataRow, Notice, PageHeader } from '@/components/ui/layout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatCents } from '@/lib/money';
import { storeName } from '@/lib/env';

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: string;
  email_status: string;
  email_sent_at: string | null;
  created_at: string;
  shipping_address: string;
  city: string;
  state: string;
  country: string;
  order_items: {
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }[];
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  const justPlaced = query.email === 'sent' || query.email === 'pending';

  // Authentication is required. RLS additionally guarantees that even an
  // authenticated user cannot read somebody else's order.
  await requireUser(`/order/${orderNumber}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_email, subtotal_cents, shipping_cents, total_cents, status, email_status, email_sent_at, created_at, shipping_address, city, state, country, order_items(product_name, quantity, unit_price_cents, subtotal_cents)',
    )
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) throw new Error(`Failed to load order: ${error.message}`);

  // A missing order and someone else's order are indistinguishable to the
  // client, which is the point: this must not confirm that a reference exists.
  if (!data) notFound();

  const order = data as OrderRow;
  const emailFailed = order.email_status === 'failed';
  const emailPending = order.email_status === 'pending';

  return (
    <Container size="narrow" className="py-12 sm:py-16">
      <ClearCartOnMount />

      {justPlaced ? (
        <div className="mb-10 flex flex-col items-start gap-4 border-b border-line pb-10">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m5 13 4 4L19 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <h1 className="text-3xl font-semibold">Order placed</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              Thank you, {order.customer_name}. We have your order and will be in touch about
              payment before dispatch.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-10">
          <PageHeader eyebrow="Order" title={order.order_number} />
        </div>
      )}

      {emailFailed ? (
        <div className="mb-8">
          <Notice tone="danger" title="We could not send your confirmation email">
            Your order is saved and nothing is lost. The email did not go out — you can try sending
            it again, or just keep this page as your reference.
            <form action={resendOrderEmail} className="mt-3">
              <input type="hidden" name="orderNumber" value={order.order_number} />
              <Button type="submit" variant="secondary" size="sm">
                Try sending it again
              </Button>
            </form>
          </Notice>
        </div>
      ) : emailPending ? (
        <div className="mb-8">
          <Notice tone="warning" title="Confirmation email is still sending">
            Your order is confirmed. The email may take a moment to arrive.
          </Notice>
        </div>
      ) : (
        <div className="mb-8">
          <Notice tone="success" title="Confirmation email sent">
            We have sent the details to {order.customer_email}.
          </Notice>
        </div>
      )}

      <section className="border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-6 py-4">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
            Items
          </h2>
          <p className="text-[13px] text-ink-muted">
            Placed{' '}
            {new Date(order.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </p>
        </div>

        <ul className="divide-y divide-line px-6">
          {order.order_items.map((item) => (
            <li key={item.product_name} className="flex items-baseline justify-between gap-4 py-4">
              <div>
                <p className="text-sm text-ink">{item.product_name}</p>
                <p className="text-[13px] tabular-nums text-ink-muted">
                  {item.quantity} × {formatCents(item.unit_price_cents)}
                </p>
              </div>
              <p className="text-sm tabular-nums text-ink">{formatCents(item.subtotal_cents)}</p>
            </li>
          ))}
        </ul>

        <dl className="border-t border-line px-6 py-4">
          <DataRow label="Subtotal" value={formatCents(order.subtotal_cents)} />
          <DataRow
            label="Shipping"
            value={order.shipping_cents === 0 ? 'Free' : formatCents(order.shipping_cents)}
          />
          <div className="my-3 border-t border-line" />
          <DataRow label="Total" emphasis value={formatCents(order.total_cents)} />
        </dl>

        <div className="border-t border-line px-6 py-4">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
            Shipping to
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {order.customer_name}
            <br />
            {order.shipping_address}
            <br />
            {order.city}, {order.state}, {order.country}
          </p>
        </div>

        <div className="border-t border-line px-6 py-4">
          <DataRow
            label="Status"
            value={
              <span className="rounded-xs bg-accent-soft px-2 py-1 text-[13px] text-accent">
                {order.status.replace(/_/g, ' ')}
              </span>
            }
          />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-xs bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink-soft"
        >
          Continue shopping
        </Link>
        <Link
          href="/account"
          className="inline-flex h-10 items-center rounded-xs border border-line-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
        >
          All your orders
        </Link>
      </div>

      <p className="mt-8 text-[13px] leading-relaxed text-ink-muted">
        A copy of this confirmation has been sent by {storeName()}. Keep the order number{' '}
        {order.order_number} for any correspondence.
      </p>
    </Container>
  );
}
