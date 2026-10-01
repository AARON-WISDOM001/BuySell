import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { getUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/checkout';
  const user = await getUser();

  // The form itself blocks submission when unauthenticated, but we render the
  // sign-in prompt up front so a guest is never shown a form they cannot use.
  return <CheckoutForm isAuthenticated={Boolean(user)} next={next} />;
}
