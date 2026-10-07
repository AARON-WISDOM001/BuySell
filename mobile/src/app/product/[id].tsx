import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Heading, Notice, Screen } from '@/components/ui';
import { useCart, MAX_LINE_QUANTITY } from '@/lib/cart';
import { money, resolveProductImageUrl, supabase, type Product } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { add } = useCart();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (typeof id !== 'string') return;
    let active = true;
    void supabase
      .from('products')
      .select('id, slug, name, description, image_url, price_cents, stock_quantity')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError || !data) setError('That product is no longer available.');
        else setProduct(data as Product);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <Screen style={styles.padded}>
        <Notice>{error}</Notice>
        <Button label="Back to catalogue" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!product) return <Screen />;

  const available = Math.min(product.stock_quantity, MAX_LINE_QUANTITY);
  const soldOut = available <= 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.padded}>
        {resolveProductImageUrl(product.image_url) ? (
          <Image
            source={{ uri: resolveProductImageUrl(product.image_url) ?? undefined }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <Heading>{product.name}</Heading>
        <Text style={styles.price}>{money(product.price_cents)}</Text>
        {product.description ? <Text style={styles.body}>{product.description}</Text> : null}

        {soldOut ? <Notice>Out of stock.</Notice> : null}

        <Button
          label={added ? 'Added' : 'Add to cart'}
          disabled={soldOut}
          onPress={() => {
            add(product.id);
            setAdded(true);
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  padded: {
    padding: 20,
    gap: 16,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 2,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.line,
  },
  price: {
    fontSize: 18,
    color: theme.inkSoft,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.inkSoft,
  },
  });
}
