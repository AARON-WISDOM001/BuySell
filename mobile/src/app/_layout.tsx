import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { CartProvider } from '@/lib/cart';
import { theme } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.canvas },
              headerTitleStyle: { color: theme.ink },
              headerTintColor: theme.ink,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: theme.canvas },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'BuySell' }} />
            <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
            <Stack.Screen name="cart" options={{ title: 'Cart' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order confirmed' }} />
            <Stack.Screen name="account" options={{ title: 'Account' }} />
          </Stack>
        </CartProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
