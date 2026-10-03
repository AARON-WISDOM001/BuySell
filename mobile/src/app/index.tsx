import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Button, Divider, Heading, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';
import { money, supabase, type Product } from '@/lib/supabase';
import { theme } from '@/lib/theme';

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { add, count } = useCart();
  const { user } = useSession();

  async function load() {
    setLoading(true);
    setError(null);
    // Public catalogue: the products policy allows anon reads, so no session is
    // needed and the shop works before sign-in.
    const { data, error: loadError } = await supabase
      .from('products')
      .select('id, slug, name, description, image_url, price_cents, stock_quantity')
      .order('name');

    if (loadError) setError('Could not load the catalogue. Pull down to try again.');
    else setProducts((data ?? []) as Product[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Heading>Curated goods</Heading>
            <View style={styles.headerRow}>
              <Text style={styles.account}>
                {user ? (user.email ?? 'Signed in') : 'Browsing as a guest'}
              </Text>
              <Link href="/cart" style={styles.cartLink}>
                Cart{count > 0 ? ` (${count})` : ''}
              </Link>
            </View>
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <Text style={styles.empty}>Loading…</Text> : null
        }
        renderItem={({ item }) => (
          <View>
            <Link href={`/product/${item.id}`} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>{money(item.price_cents)}</Text>
                {item.stock_quantity <= 0 ? <Text style={styles.soldOut}>Out of stock</Text> : null}
              </View>
              <Button
                label="Add"
                variant="secondary"
                disabled={item.stock_quantity <= 0}
                onPress={() => add(item.id)}
              />
            </Link>
            <Divider />
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Link href="/account" style={styles.cartLink}>
              {user ? 'Account' : 'Sign in'}
            </Link>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 20,
    gap: 0,
  },
  header: {
    gap: 12,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  account: {
    color: theme.inkMuted,
    fontSize: 13,
  },
  cartLink: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 16,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.ink,
  },
  price: {
    fontSize: 14,
    color: theme.inkSoft,
  },
  soldOut: {
    fontSize: 13,
    color: theme.danger,
  },
  empty: {
    color: theme.inkMuted,
    paddingVertical: 24,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
