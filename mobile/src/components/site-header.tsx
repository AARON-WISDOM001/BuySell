import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ShoppingBag, Sun, Moon, UserRound } from 'lucide-react-native';
import { useCart } from '@/lib/cart';
import { useTheme, type Theme } from '@/lib/theme';

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { count } = useCart();
  const { theme, isDark, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const styles = createStyles(theme);
  const isAbout = pathname === '/about';

  function submitSearch() {
    const query = search.trim();
    router.push({ pathname: '/', params: query ? { q: query } : {} });
  }

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/')}>
          <Text style={styles.wordmark}>BUYSELL</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account and sign in"
            onPress={() => router.push('/account')}
            style={styles.plainAction}
          >
            <UserRound size={16} strokeWidth={1.5} color={theme.inkSoft} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            accessibilityState={{ checked: isDark }}
            onPress={toggleTheme}
            style={styles.squareAction}
          >
            {isDark ? (
              <Sun size={17} strokeWidth={1.75} color={theme.inkSoft} />
            ) : (
              <Moon size={17} strokeWidth={1.75} color={theme.inkSoft} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
            onPress={() => router.push('/cart')}
            style={styles.cartAction}
          >
            <ShoppingBag size={18} strokeWidth={1.5} color={theme.inkSoft} />
            {count > 0 ? <Text style={styles.cartCount}>{count}</Text> : null}
          </Pressable>
        </View>
      </View>

      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ selected: !isAbout }}
          onPress={() => router.push('/')}
          style={[styles.navLink, !isAbout && styles.navLinkActive]}
        >
          <Text style={[styles.navLabel, !isAbout && styles.navLabelActive]}>Shop</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ selected: isAbout }}
          onPress={() => router.push('/about')}
          style={[styles.navLink, isAbout && styles.navLinkActive]}
        >
          <Text style={[styles.navLabel, isAbout && styles.navLabelActive]}>About</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Search products"
          returnKeyType="search"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={submitSearch}
          placeholder="Search"
          placeholderTextColor={theme.inkMuted}
          style={styles.search}
          selectionColor={theme.accent}
        />
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      backgroundColor: theme.canvas,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    topRow: {
      height: 54,
      paddingHorizontal: 19,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    wordmark: {
      color: theme.ink,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 2.1,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    plainAction: {
      width: 34,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    squareAction: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 2,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
    },
    cartAction: {
      width: 32,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 2,
    },
    cartCount: {
      color: theme.ink,
      fontSize: 11,
      fontWeight: '600',
    },
    navRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 2,
      paddingHorizontal: 19,
      borderTopWidth: 1,
      borderTopColor: theme.line,
    },
    navLink: {
      minWidth: 54,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    navLinkActive: {
      borderBottomColor: theme.ink,
    },
    navLabel: {
      color: theme.inkSoft,
      fontSize: 13,
    },
    navLabelActive: {
      color: theme.ink,
      fontWeight: '600',
    },
    search: {
      height: 36,
      minWidth: 96,
      flex: 1,
      maxWidth: 152,
      marginLeft: 'auto',
      alignSelf: 'center',
      paddingHorizontal: 11,
      borderRadius: 2,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      color: theme.ink,
      fontSize: 13,
    },
  });
}
