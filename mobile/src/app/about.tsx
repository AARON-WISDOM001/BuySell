import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Heading, Screen } from '@/components/ui';
import { useTheme, type Theme } from '@/lib/theme';

export default function AboutScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>About</Text>
        <Heading>A short catalogue on purpose</Heading>
        <Text style={styles.body}>
          BuySell exists because most shops make you work. The catalogue is short on purpose:
          everything here has been used long enough to know whether it holds up.
        </Text>
        <Text style={styles.body}>
          We do not run flash sales or manufacture urgency. When something is out of stock it says
          so, and when stock is low it says that too.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How ordering works</Text>
          <Text style={styles.body}>
            Placing an order reserves your items and records it in our system. No payment is taken
            online. We will contact you to arrange payment and shipping before dispatch. You will
            get a confirmation by email, and the order stays visible in your account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping</Text>
          <Text style={styles.body}>Free shipping on qualifying orders. Dispatch is arranged after payment is confirmed.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Returns</Text>
          <Text style={styles.body}>
            If something is not right, tell us and we will sort it out. Contact us within 30 days
            with the item unused and in its original packaging.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 20,
      paddingTop: 42,
      paddingBottom: 40,
      gap: 18,
    },
    eyebrow: {
      color: theme.inkMuted,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    body: {
      color: theme.inkSoft,
      fontSize: 15,
      lineHeight: 24,
    },
    section: {
      paddingTop: 12,
      gap: 12,
    },
    sectionTitle: {
      color: theme.ink,
      fontSize: 18,
      fontWeight: '600',
    },
  });
}
