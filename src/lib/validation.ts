import { z } from 'zod';
import { MAX_LINE_QUANTITY } from '@/lib/cart';

/**
 * Checkout input validation.
 *
 * This is the only trust boundary between the browser and order creation, so it
 * is intentionally strict: no field is optional unless the product model truly
 * does not need it, and unknown keys are stripped rather than passed along.
 *
 * Note what is NOT here: price, subtotal, total, stock, user_id. Those are not
 * accepted from the client at all.
 */

const trimmed = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, { message: `${label} is required` })
    .max(max, { message: `${label} must be ${max} characters or fewer` });

export const checkoutSchema = z.object({
  customerName: trimmed('Name', 2, 120),
  customerEmail: z.email({ message: 'Enter a valid email address' }).max(254),
  phone: trimmed('Phone', 7, 32).optional().or(z.literal('').transform(() => '')),
  shippingAddress: trimmed('Address', 4, 200),
  city: trimmed('City', 2, 100),
  state: trimmed('State', 2, 100),
  country: trimmed('Country', 2, 100),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * A UUID in the shape Postgres accepts.
 *
 * Deliberately not z.uuid(), which enforces the RFC 4122 version nibble and
 * rejects uuidv7. That would be stricter than the `uuid` column type, so the
 * moment a product id is generated with a newer UUID version every checkout
 * would fail closed. Shape-only validation is enough: these ids come from our
 * own database, and anything malformed is rejected by Postgres regardless.
 */
const uuidShape =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The cart as it arrives from the browser. Prices are absent by design.
 */
export const cartSubmissionSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(uuidShape, { message: 'Invalid product reference' }),
        quantity: z
          .number()
          .int('Quantity must be a whole number')
          .min(1, 'Quantity must be at least 1')
          .max(MAX_LINE_QUANTITY, `Quantity cannot exceed ${MAX_LINE_QUANTITY}`),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(50, 'Too many items in one order'),
});

export type CartSubmission = z.infer<typeof cartSubmissionSchema>;

/**
 * Flatten a ZodError into `{ fieldName: firstMessage }` for inline rendering,
 * plus a list for the focusable error summary at the top of the form.
 */
/** Form state returned by `placeOrder`. */
export type OrderActionState = {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  errors?: { field: string; message: string }[];
};

/**
 * Initial state for `useActionState`.
 *
 * It lives here rather than in the action module because a `"use server"` file
 * may only export async functions — exporting this object from one is a build
 * error, not a warning.
 */
export const initialOrderState: OrderActionState = { status: 'idle' };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!result[field]) result[field] = issue.message;
  }
  return result;
}

export function errorSummary(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: String(issue.path[0] ?? 'form'),
    message: issue.message,
  }));
}