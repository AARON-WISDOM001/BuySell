import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { requireUser } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { Container, DataRow, PageHeader } from '@/components/ui/layout';
import { formatCents } from '@/lib/money';

export const metadata: Metadata = { title: 'Account' };

type OrderSummary = {
  id: string;
  order_number: string;
  total_cents: number;
  status: string;
  created_at: string;
};

export default async function AccountPage() {
  const user = await requireUser('/account');
  const supabase = await createClient();

  // Both of these are scoped to the signed-in user by RLS. There is no
  // user_id filter here on purpose — filtering in application code would imply
  // the query could return someone else's rows, and the policy is what
  // actually prevents that.
  const [{ data: profile }, { data: orders, error }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url').maybeSingle(),
    supabase
      .from('orders')
      .select('id, order_number, total_cents, status, created_at')
      .order('created_at', { ascending: false }),
  ]);

  if (error) throw new Error(`Failed to load orders: ${error.message}`);

  const history = (orders ?? []) as OrderSummary[];
  const name = profile?.full_name || user.user_metadata?.full_name || user.email;

  return (
    <Container size="narrow" className="py-12 sm:py-16">
      <PageHeader eyebrow="Account" title="Your orders" />

      <div className="mt-8 flex items-center gap-4 border border-line bg-surface px-5 py-5">
        {profile?.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-full border border-line"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-sm font-medium text-ink-soft"
          >
            {(name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="truncate text-[13px] text-ink-muted">{user.email}</p>
        </div>
      </div>

      <h2 className="mt-12 text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
        Order history
      </h2>

      {history.length === 0 ? (
        <div className="mt-4 border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">No orders yet</p>
          <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-ink-soft">
            When you place an order it will appear here, with its status and total.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center rounded-xs bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink-soft"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {history.map((order) => (
            <li key={order.id}>
              <Link
                href={`/order/${order.order_number}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5 transition-colors hover:bg-canvas"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{order.order_number}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {new Date(order.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </p>
                </div>

                <span className="rounded-xs bg-accent-soft px-2 py-1 text-[13px] text-accent">
                  {order.status.replace(/_/g, ' ')}
                </span>

                <p className="text-sm tabular-nums text-ink">{formatCents(order.total_cents)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
          What happens next
        </h2>
        <dl className="mt-3 border border-line bg-surface px-5 py-4">
          <DataRow label="Payment" value="Arranged before dispatch" />
          <DataRow label="Confirmation" value="By email, immediately" />
          <DataRow label="Dispatch" value="3–5 working days after payment" />
        </dl>
      </section>
    </Container>
  );
}
