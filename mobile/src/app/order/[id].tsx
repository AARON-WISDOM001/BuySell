import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Heading, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useTheme, type Theme } from '@/lib/theme';

export default function OrderConfirmed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Screen style={styles.padded}>
      <Heading>Order placed</Heading>
      <Text style={styles.order}>Order {id}</Text>
      <Text style={styles.body}>
        A confirmation is on its way to {user?.email ?? 'your email'}. Your cart is now empty.
      </Text>
      <Button label="Back to catalogue" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  padded: {
    padding: 20,
    gap: 16,
  },
  order: {
    fontSize: 15,
    color: theme.accent,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.inkSoft,
  },
  });
}
