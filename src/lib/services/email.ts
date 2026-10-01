import 'server-only';

import { mailgunEnv, siteUrl, storeName } from '@/lib/env';
import { formatCents } from '@/lib/money';

/**
 * Mailgun delivery.
 *
 * Uses the Mailgun v3 REST API directly over fetch rather than pulling in the
 * mailgun.js SDK. The API is a single form-encoded POST with HTTP Basic auth,
 * so the SDK would add a dependency (and its node-fetch polyfill baggage)
 * without removing any code we have to write.
 *
 * Server-only: `import 'server-only'` at the top means importing this from a
 * client component is a build error, not a runtime credential leak.
 */

export type OrderEmailItem = {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
};

export type OrderEmailData = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: OrderEmailItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: string;
  city: string;
  state: string;
  country: string;
  createdAt: string;
};

export type EmailResult =
  | { ok: true }
  | { ok: false; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
}

function buildTextBody(data: OrderEmailData): string {
  const lines = [
    `${storeName()} — order confirmation`,
    '',
    `Order ${data.orderNumber}`,
    `Placed ${formatDate(data.createdAt)}`,
    '',
    'Items',
    ...data.items.map(
      (item) =>
        `  ${item.productName} x${item.quantity} — ${formatCents(item.unitPriceCents)} each = ${formatCents(item.subtotalCents)}`,
    ),
    '',
    `Subtotal:  ${formatCents(data.subtotalCents)}`,
    `Shipping:  ${data.shippingCents === 0 ? 'Free' : formatCents(data.shippingCents)}`,
    `Total:     ${formatCents(data.totalCents)}`,
    '',
    'Shipping to',
    `  ${data.customerName}`,
    `  ${data.shippingAddress}`,
    `  ${data.city}, ${data.state}, ${data.country}`,
    '',
    'No payment was collected for this order.',
    '',
    `Manage this order: ${siteUrl()}/account`,
    `Thank you for your order.`,
  ];
  return lines.join('\n');
}

function buildHtmlBody(data: OrderEmailData): string {
  const rows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e7e5e4;">
          <div style="color:#1c1917;font-size:15px;font-weight:500;">${escapeHtml(item.productName)}</div>
          <div style="color:#78716c;font-size:13px;margin-top:2px;">
            ${item.quantity} &times; ${escapeHtml(formatCents(item.unitPriceCents))}
          </div>
        </td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #e7e5e4;color:#1c1917;font-size:15px;white-space:nowrap;">
          ${escapeHtml(formatCents(item.subtotalCents))}
        </td>
      </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:4px 0;color:${strong ? '#1c1917' : '#78716c'};font-size:${strong ? '15px' : '14px'};${strong ? 'font-weight:600;' : ''}">
        ${label}
      </td>
      <td align="right" style="padding:4px 0;color:#1c1917;font-size:${strong ? '17px' : '14px'};${strong ? 'font-weight:600;' : ''}white-space:nowrap;">
        ${escapeHtml(value)}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#fafaf9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e5e4;">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #e7e5e4;">
              <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#1c1917;font-weight:600;">
                ${escapeHtml(storeName())}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h1 style="margin:0 0 6px;font-size:21px;line-height:1.3;color:#1c1917;font-weight:600;letter-spacing:-0.021em;">
                Thank you, ${escapeHtml(data.customerName)}
              </h1>
              <p style="margin:0 0 24px;color:#78716c;font-size:14px;line-height:1.6;">
                Your order is confirmed. A copy of the details is below.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;margin-bottom:24px;">
                <tr><td style="padding:14px 16px;">
                  <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#78716c;">Order number</div>
                  <div style="font-size:16px;color:#1c1917;font-weight:600;margin-top:3px;">${escapeHtml(data.orderNumber)}</div>
                  <div style="font-size:13px;color:#78716c;margin-top:6px;">Placed ${escapeHtml(formatDate(data.createdAt))}</div>
                </td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #e7e5e4;">
                ${totalRow('Subtotal', formatCents(data.subtotalCents))}
                ${totalRow('Shipping', data.shippingCents === 0 ? 'Free' : formatCents(data.shippingCents))}
                ${totalRow('Total', formatCents(data.totalCents), true)}
              </table>

              <h2 style="margin:28px 0 8px;font-size:14px;color:#1c1917;font-weight:600;">Shipping to</h2>
              <p style="margin:0 0 24px;color:#44403c;font-size:14px;line-height:1.7;">
                ${escapeHtml(data.customerName)}<br>
                ${escapeHtml(data.shippingAddress)}<br>
                ${escapeHtml(data.city)}, ${escapeHtml(data.state)}, ${escapeHtml(data.country)}
              </p>

              <p style="margin:0 0 24px;padding:12px 14px;background:#fef3c7;border:1px solid #fde68a;color:#78350f;font-size:13px;line-height:1.6;">
                No payment has been collected for this order. It is recorded as
                awaiting payment.
              </p>

              <a href="${siteUrl()}/account"
                 style="display:inline-block;padding:11px 20px;background:#1c1917;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;">
                View your order
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e7e5e4;color:#78716c;font-size:12px;line-height:1.6;">
              ${escapeHtml(storeName())} &middot; You are receiving this because you placed an order.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send the order confirmation.
 *
 * Never throws. The order is already committed by the time this runs, so a
 * failure must be recorded rather than propagated — see the caller in
 * app/actions/orders.ts.
 */
export async function sendOrderConfirmation(data: OrderEmailData): Promise<EmailResult> {
  let config: ReturnType<typeof mailgunEnv>;
  try {
    config = mailgunEnv();
  } catch {
    return {
      ok: false,
      error: 'Mailgun is not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM_EMAIL).',
    };
  }

  const endpoint = `https://api.mailgun.net/v3/${config.domain}/messages`;
  const subject = `${storeName()} — order ${data.orderNumber} confirmed`;

  const form = new URLSearchParams({
    from: config.fromEmail,
    to: data.customerEmail,
    subject,
    text: buildTextBody(data),
    html: buildHtmlBody(data),
    // Mailgun renders the text part for clients that refuse HTML.
    'h:Reply-To': config.fromEmail,
    'o:tag': 'order-confirmation',
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    if (!response.ok) {
      // The body may contain useful diagnostics, but it is not logged verbatim
      // because Mailgun error payloads can echo request context.
      const body = await response.text();
      console.error(
        `[mailgun] delivery failed for order ${data.orderNumber}: ${response.status} ${body.slice(0, 300)}`,
      );
      return { ok: false, error: `Mailgun responded ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mailgun] delivery threw for order ${data.orderNumber}: ${message}`);
    return { ok: false, error: message };
  }
}