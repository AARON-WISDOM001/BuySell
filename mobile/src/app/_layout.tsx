import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { CartProvider } from '@/lib/cart';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { SiteHeader } from '@/components/site-header';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <CartProvider>
            <AppShell />
          </CartProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { theme, isDark } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.canvas }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SiteHeader />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.canvas } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="about" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="cart" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="account" />
      </Stack>
    </SafeAreaView>
  );
}
