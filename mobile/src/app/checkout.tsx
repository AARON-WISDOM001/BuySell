import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Heading, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { money, supabase } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';

/**
 * Checkout, ending in place_order().
 *
 * It calls the same SECURITY DEFINER function the website's Server Action calls.
 * The total is computed inside that function from current product rows; nothing
 * priced is sent from here. That is why the phone and the site cannot produce
 * different totals for the same cart, and why tampering with the app cannot
 * change what is charged.
 */

type Field = {
  name: 'name' | 'email' | 'phone' | 'address' | 'city' | 'state' | 'country';
  label: string;
  placeholder: string;
  keyboard?: 'default' | 'email-address' | 'phone-pad';
};

const FIELDS: Field[] = [
  { name: 'name', label: 'Full name', placeholder: 'Ada Lovelace' },
  { name: 'email', label: 'Email', placeholder: 'you@example.com', keyboard: 'email-address' },
  { name: 'phone', label: 'Phone', placeholder: 'Optional', keyboard: 'phone-pad' },
  { name: 'address', label: 'Shipping address', placeholder: '1 Example Street' },
  { name: 'city', label: 'City', placeholder: 'Lagos' },
  { name: 'state', label: 'State', placeholder: 'Lagos' },
  { name: 'country', label: 'Country', placeholder: 'Nigeria' },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { priced, subtotalCents, isEmpty, clear, overStock } = useCart();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [values, setValues] = useState<Record<string, string>>({
    email: user?.email ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isEmpty && !submitting) {
    return (
      <Screen style={styles.padded}>
        <Heading>Checkout</Heading>
        <Notice tone="muted">Your cart is empty.</Notice>
      </Screen>
    );
  }

  async function placeOrder() {
    setError(null);

    const missing = FIELDS.filter((field) => !values[field.name]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in ${missing.map((field) => field.label).join(', ')}.`);
      return;
    }

    if (!user) {
      setError('Sign in to place an order.');
      return;
    }

    setSubmitting(true);
    try {
      // Ids and quantities only. Prices and totals are the database's business.
      const { data, error: orderError } = await supabase.rpc('place_order', {
        p_items: priced.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
        p_customer_email: values.email,
        p_customer_name: values.name,
        p_phone: values.phone || null,
        p_shipping_address: values.address,
        p_city: values.city,
        p_state: values.state,
        p_country: values.country,
        p_shipping_cents: 0,
      });

      if (orderError) {
        setError(orderError.message.includes('stock')
          ? 'Some items are no longer available in that quantity. Adjust your cart.'
          : 'We could not place the order. Please try again.');
        setSubmitting(false);
        return;
      }

      const orderNumber = (data as { order_number?: string } | null)?.order_number;
      // Only now that the order exists is the cart cleared.
      clear();
      router.replace(orderNumber ? `/order/${orderNumber}` : '/');
    } catch (caught) {
      console.error('place_order failed', caught);
      setError('We could not place the order. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.padded}>
          <Heading>Checkout</Heading>

          {overStock.length > 0 ? (
            <Notice tone="muted">
              Adjust quantities that exceed stock before placing the order.
            </Notice>
          ) : null}

          {FIELDS.map((field) => (
            <View key={field.name} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                style={styles.input}
                value={values[field.name] ?? ''}
                onChangeText={(next) => setValues((current) => ({ ...current, [field.name]: next }))}
                placeholder={field.placeholder}
                placeholderTextColor={theme.inkMuted}
                keyboardType={field.keyboard ?? 'default'}
                autoCapitalize={field.name === 'email' ? 'none' : 'sentences'}
                autoCorrect={field.name === 'email' ? false : true}
              />
            </View>
          ))}

          {error ? <Notice>{error}</Notice> : null}

          <View style={styles.total}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{money(subtotalCents)}</Text>
          </View>

          <Button
            label={submitting ? 'Placing order…' : 'Place order'}
            onPress={() => void placeOrder()}
            disabled={submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  flex: { flex: 1 },
  padded: {
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.inkSoft,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.lineStrong,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.ink,
    borderRadius: 2,
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.ink,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.ink,
  },
  });
}
