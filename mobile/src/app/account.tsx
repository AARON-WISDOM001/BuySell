import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Heading, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { theme } from '@/lib/theme';

export default function AccountScreen() {
  const { user, isReady, signIn, signOut, error } = useSession();
  const { count } = useCart();

  if (!isReady) {
    return (
      <Screen style={styles.padded}>
        <ActivityIndicator color={theme.inkMuted} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.padded}>
      <Heading>{user ? 'Your account' : 'Sign in'}</Heading>

      {user ? (
        <View style={styles.card}>
          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.muted}>
            {user.user_metadata?.full_name ?? 'Signed in with Google'}
          </Text>
          <Text style={styles.muted}>
            Your cart is shared with every device signed in to this account.
          </Text>
          <View style={styles.row}>
            <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.muted}>
            Sign in to keep your cart across devices. You can browse and build a cart without an
            account — it moves here when you sign in.
          </Text>
          {count > 0 ? (
            <Text style={styles.muted}>
              {count} {count === 1 ? 'item is' : 'items are'} waiting in this device's cart.
            </Text>
          ) : null}
          <View style={styles.row}>
            <Button label="Continue with Google" onPress={() => void signIn()} />
          </View>
        </View>
      )}

      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  padded: {
    padding: 20,
    gap: 16,
  },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.surface,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.ink,
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.inkMuted,
  },
  row: {
    paddingTop: 4,
  },
});
