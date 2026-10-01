'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendOrderConfirmation, type OrderEmailData } from '@/lib/services/email';
import {
  cartSubmissionSchema,
  checkoutSchema,
  errorSummary,
  fieldErrors,
} from '@/lib/validation';
import { shippingFor } from '@/lib/env';
import type { CartLine } from '@/lib/cart';

/**
 * Order creation.
 *
 * Security properties this action is responsible for:
 *  - it authenticates, and derives user_id from the session, never from input;
 *  - it accepts product ids and quantities only, so there is no price field a
 *    client could tamper with;
 *  - all arithmetic happens inside place_order() in Postgres, in one
 *    transaction, against the current product rows;
 *  - a failed email never produces a second order.
 */

import type { OrderActionState } from '@/lib/validation';

const MAX_ERROR_LENGTH = 500;

/**
 * Translate a database error into something a shopper can act on, without
 * leaking internals like table or column names.
 */
function describeDatabaseError(message: string): string {
  if (message.includes('Insufficient stock')) {
    return 'Some items sold out while you were checking out. Review your cart and try again.';
  }
  if (message.includes('Quantity out of range')) {
    return 'One of the quantities is no longer allowed. Review your cart and try again.';
  }
  if (message.includes('does not exist')) {
    return 'One of the items in your cart is no longer available. Remove it and try again.';
  }
  if (message.includes('at least one item')) {
    return 'Your cart is empty.';
  }
  if (message.includes('Not authenticated') || message.includes('42501')) {
    return 'Your session has expired. Please sign in again to complete your order.';
  }
  // Never surface a raw database message to the browser.
  console.error(`[checkout] place_order failed: ${message.slice(0, MAX_ERROR_LENGTH)}`);
  return 'We could not complete your order. Please try again in a moment.';
}

export async function placeOrder(
  _prevState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  // 1. Authenticate. This is a public endpoint, so the check happens here and
  //    not in the page that renders the form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: 'error',
      message: 'Please sign in to complete your order. Your cart has been kept.',
    };
  }

  // 2. Validate shape. Anything not described here does not exist.
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get('items') ?? '[]'));
  } catch {
    return {
      status: 'error',
      message: 'Your cart could not be read. Refresh the page and try again.',
    };
  }

  const cartResult = cartSubmissionSchema.safeParse({ items: rawItems });

  if (!cartResult.success) {
    return {
      status: 'error',
      message: 'Your cart could not be read. Refresh the page and try again.',
      errors: errorSummary(cartResult.error),
    };
  }

  const detailsResult = checkoutSchema.safeParse({
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    phone: formData.get('phone'),
    shippingAddress: formData.get('shippingAddress'),
    city: formData.get('city'),
    state: formData.get('state'),
    country: formData.get('country'),
  });

  if (!detailsResult.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields and try again.',
      fieldErrors: fieldErrors(detailsResult.error),
      errors: errorSummary(detailsResult.error),
    };
  }

  const details = detailsResult.data;

  // 3. Compute shipping server-side. The browser cannot influence it.
  const displaySubtotal = await estimateSubtotal(supabase, cartResult.data.items);

  // 4. Create the order. Prices, totals, and stock are all handled inside the
  //    database function in a single transaction.
  const { data: order, error } = await supabase.rpc('place_order', {
    // place_order reads `product_id` / `quantity` keys from the JSON array. The
    // cart uses camelCase internally, so translate here at the boundary rather
    // than letting the function silently see an empty list.
    p_items: cartResult.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    p_customer_email: details.customerEmail,
    p_customer_name: details.customerName,
    p_phone: details.phone || null,
    p_shipping_address: details.shippingAddress,
    p_city: details.city,
    p_state: details.state,
    p_country: details.country,
    p_shipping_cents: shippingFor(displaySubtotal),
  });

  if (error || !order) {
    return {
      status: 'error',
      message: describeDatabaseError(error?.message ?? 'unknown error'),
    };
  }

  // 5. Load the committed line items so the email reflects what was actually
  //    stored, not what the client claimed.
  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, unit_price_cents, subtotal_cents')
    .eq('order_id', order.id);

  const emailData: OrderEmailData = {
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    items: (items ?? []).map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    })),
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents,
    shippingAddress: order.shipping_address,
    city: order.city,
    state: order.state,
    country: order.country,
    createdAt: order.created_at,
  };

  // 6. Send the confirmation. The order already exists; a failure here is
  //    recorded on the order and surfaced to the customer, and can be retried
  //    later from the same rows. It must never trigger a second place_order.
  let emailDelivered = false;
  try {
    const result = await sendOrderConfirmation(emailData);
    emailDelivered = result.ok;

    // Recorded server-side regardless of outcome. The SQL function is scoped to
    // the caller's own order.
    const { error: statusError } = await supabase.rpc('set_order_email_status', {
      p_order_id: order.id,
      p_sent: result.ok,
      p_error: result.ok ? null : result.error,
    });
    if (statusError) {
      console.error(`[checkout] could not record email status: ${statusError.message}`);
    }
  } catch (error) {
    // sendOrderConfirmation already swallows its own errors; this guard exists
    // so an unexpected throw can never turn a committed order into a failure.
    console.error(
      `[checkout] unexpected email error for order ${order.order_number}:`,
      error instanceof Error ? error.message : error,
    );
  }

  revalidatePath('/account', 'layout');
  revalidatePath('/');

  // 7. Success, with the reference. The confirmation page reads the order from
  //    the database rather than trusting anything passed through the URL.
  redirect(
    `/order/${order.order_number}?email=${emailDelivered ? 'sent' : 'pending'}`,
  );
}

/**
 * Best-effort subtotal used only to decide shipping. It is recomputed
 * authoritatively inside place_order(); a wrong guess here can only affect the
 * shipping quote shown, never the stored total.
 */
async function estimateSubtotal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: CartLine[],
): Promise<number> {
  const { data } = await supabase
    .from('products')
    .select('id, price_cents')
    .in(
      'id',
      items.map((item) => item.productId),
    );

  const prices = new Map((data ?? []).map((row) => [row.id, row.price_cents]));
  return items.reduce((total, item) => total + (prices.get(item.productId) ?? 0) * item.quantity, 0);
}

/**
 * Re-send a failed confirmation.
 *
 * The retry path the email-failure strategy depends on. It reuses the stored
 * snapshot, so it cannot create a new order and cannot charge again.
 */
export async function resendOrderEmail(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const orderNumber = String(formData.get('orderNumber') ?? '');
  if (!orderNumber) return;

  // RLS restricts this to the caller's own order, so a guessed order number
  // from another customer returns nothing.
  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_email, subtotal_cents, shipping_cents, total_cents, shipping_address, city, state, country, created_at, order_items(product_name, quantity, unit_price_cents, subtotal_cents)',
    )
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (!order) return;

  const result = await sendOrderConfirmation({
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    items: order.order_items.map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    })),
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents,
    shippingAddress: order.shipping_address,
    city: order.city,
    state: order.state,
    country: order.country,
    createdAt: order.created_at,
  });

  await supabase.rpc('set_order_email_status', {
    p_order_id: order.id,
    p_sent: result.ok,
    p_error: result.ok ? null : result.error,
  });

  revalidatePath('/account', 'layout');
}
