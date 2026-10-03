import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Divider, Heading, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { money } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function CartScreen() {
  const { priced, subtotalCents, isEmpty, overStock, changeQuantity, remove, count, clear } =
    useCart();

  if (isEmpty) {
    return (
      <Screen style={styles.padded}>
        <Heading>Your cart</Heading>
        <Text style={styles.empty}>Nothing here yet.</Text>
        <Link href="/" style={styles.link}>
          Browse the catalogue
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.padded}>
        <Heading>Your cart</Heading>
        <Text style={styles.count}>
          {count} {count === 1 ? 'item' : 'items'}
        </Text>

        {overStock.length > 0 ? (
          <Notice>
            {overStock.length === 1
              ? `${overStock[0].name} has only ${overStock[0].stockQuantity} left.`
              : `${overStock.length} items exceed the stock available.`}
          </Notice>
        ) : null}

        <View style={styles.lines}>
          {priced.map((line) => (
            <View key={line.productId}>
              <View style={styles.line}>
                <View style={styles.lineText}>
                  <Text style={styles.name}>{line.name}</Text>
                  <Text style={styles.price}>{money(line.unitPriceCents)} each</Text>
                </View>

                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${line.name}`}
                    onPress={() => changeQuantity(line.productId, -1)}
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperLabel}>−</Text>
                  </Pressable>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${line.name}`}
                    onPress={() => changeQuantity(line.productId, 1)}
                    style={styles.stepperButton}
                  >
                    <Text style={styles.stepperLabel}>+</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${line.name}`}
                    onPress={() => remove(line.productId)}
                    style={styles.remove}
                  >
                    <Text style={styles.removeLabel}>Remove</Text>
                  </Pressable>
                </View>
              </View>
              <Divider />
            </View>
          ))}
        </View>

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{money(subtotalCents)}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Shipping and tax are confirmed at checkout.
        </Text>

        <Link href="/checkout" style={styles.checkout}>
          <Text style={styles.checkoutLabel}>Checkout</Text>
        </Link>

        <Button label="Clear cart" variant="secondary" onPress={clear} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  padded: {
    padding: 20,
    gap: 16,
  },
  empty: {
    color: theme.inkMuted,
  },
  link: {
    color: theme.accent,
    fontWeight: '600',
  },
  count: {
    color: theme.inkMuted,
    fontSize: 14,
  },
  lines: {
    gap: 0,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 12,
  },
  lineText: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.ink,
  },
  price: {
    fontSize: 13,
    color: theme.inkMuted,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.lineStrong,
    backgroundColor: theme.surface,
  },
  stepperLabel: {
    fontSize: 18,
    color: theme.ink,
    lineHeight: 22,
  },
  quantity: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 16,
    color: theme.ink,
  },
  remove: {
    paddingHorizontal: 4,
  },
  removeLabel: {
    fontSize: 13,
    color: theme.danger,
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
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
  disclaimer: {
    fontSize: 13,
    color: theme.inkMuted,
  },
  checkout: {
    backgroundColor: theme.ink,
    borderRadius: 2,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutLabel: {
    color: theme.onInk,
    fontSize: 15,
    fontWeight: '600',
  },
});
