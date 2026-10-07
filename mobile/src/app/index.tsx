import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
import { Heading, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { money, resolveProductImageUrl, supabase, type Product } from '@/lib/supabase';
import { useTheme, type Theme } from '@/lib/theme';

type CatalogProduct = Product & {
  is_featured: boolean;
  categoryName: string | null;
  categorySlug: string | null;
};

type CatalogRow = Product & {
  is_featured: boolean;
  category: { name: string; slug: string }[] | null;
};

type Category = { id: string; name: string; slug: string };

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A to Z' },
] as const;

const FALLBACK_CATEGORIES: Record<string, { name: string; slug: string }> = {
  'studio-headphones': { name: 'Audio', slug: 'audio' },
  'portable-speaker': { name: 'Audio', slug: 'audio' },
  'usb-microphone': { name: 'Audio', slug: 'audio' },
  'desk-lamp': { name: 'Desk', slug: 'desk' },
  'oak-monitor-stand': { name: 'Desk', slug: 'desk' },
  'cable-tray': { name: 'Desk', slug: 'desk' },
  'mechanical-keyboard': { name: 'Desk', slug: 'desk' },
  'wireless-mouse': { name: 'Desk', slug: 'desk' },
  'usb-c-hub': { name: 'Desk', slug: 'desk' },
  'desk-mat': { name: 'Workspace', slug: 'workspace' },
  'dot-grid-notebook': { name: 'Workspace', slug: 'workspace' },
  'pen-set': { name: 'Workspace', slug: 'workspace' },
  'ceramic-mug': { name: 'Drinkware', slug: 'drinkware' },
  'insulated-flask': { name: 'Drinkware', slug: 'drinkware' },
};

export default function Catalog() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const { add } = useCart();
  const { theme } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const cardWidth = (viewportWidth - 38 - 20) / 2;
  const styles = createStyles(theme, cardWidth < 142);
  const params = useLocalSearchParams<{ q?: string; category?: string; sort?: string }>();
  const router = useRouter();
  const search = typeof params.q === 'string' ? params.q.trim().toLowerCase() : '';
  const activeCategory = typeof params.category === 'string' ? params.category : '';
  const sort = typeof params.sort === 'string' ? params.sort : 'featured';
  const selectedSort = SORT_OPTIONS.find((option) => option.value === sort) ?? SORT_OPTIONS[0];

  const visibleProducts = (() => {
    const filtered = products.filter((product) => {
      const matchesCategory = !activeCategory || product.categorySlug === activeCategory;
      const matchesSearch = !search ||
        `${product.name} ${product.description ?? ''} ${product.categoryName ?? ''}`
          .toLowerCase()
          .includes(search);
      return matchesCategory && matchesSearch;
    });

    switch (sort) {
      case 'price_asc':
        filtered.sort((a, b) => a.price_cents - b.price_cents);
        break;
      case 'price_desc':
        filtered.sort((a, b) => b.price_cents - a.price_cents);
        break;
      case 'name_asc':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        filtered.sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.name.localeCompare(b.name));
    }
    return filtered;
  })();

  /**
   * Refetch on mount, and again whenever `reload` asks.
   *
   * Every setState happens inside the promise callback rather than in the effect
   * body. Setting state synchronously in an effect body cascades an extra render
   * pass on mount, which React 19's lint rule is right to flag.
   */
  useEffect(() => {
    let active = true;

    void Promise.all([
      supabase
        .from('products')
        .select('id, slug, name, description, image_url, price_cents, stock_quantity, is_featured, category:categories(name, slug)'),
      supabase.from('categories').select('id, name, slug').order('name'),
    ]).then(([productResult, categoryResult]) => {
      if (!active) return;
      const rows = (productResult.data ?? []) as unknown as CatalogRow[];
      const mapped = rows.map((row) => {
        const relation = row.category?.[0] ?? FALLBACK_CATEGORIES[row.slug];
        return {
          ...row,
          categoryName: relation?.name ?? null,
          categorySlug: relation?.slug ?? null,
        };
      });
      setProducts(mapped);
      setCategories((categoryResult.data ?? []) as unknown as Category[]);
      setError(productResult.error || categoryResult.error
        ? 'Could not load the catalogue. Pull down to try again.'
        : null);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  function reload() {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }

  function selectCategory(category: string) {
    router.setParams({ category: category || undefined });
  }

  function selectSort(value: string) {
    router.setParams({ sort: value === 'featured' ? undefined : value });
    setSortOpen(false);
  }

  return (
    <Screen>
      <FlatList
        data={visibleProducts}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        ListHeaderComponent={
          <View>
            <View style={styles.catalogIntro}>
              <Text style={styles.eyebrow}>
                {activeCategory
                  ? categories.find((category) => category.slug === activeCategory)?.name ?? 'Catalogue'
                  : search ? 'Search' : 'Catalogue'}
              </Text>
              <Heading>
                {activeCategory
                  ? categories.find((category) => category.slug === activeCategory)?.name ?? 'Everything in stock'
                  : search ? `Results for “${params.q}”` : 'Everything in stock'}
              </Heading>
              <Text style={styles.count}>
                {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
              </Text>
            </View>

            <View style={styles.filters}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
                <CategoryChip label="All" active={!activeCategory} onPress={() => selectCategory('')} styles={styles} />
                {categories.map((category) => (
                  <CategoryChip
                    key={category.id}
                    label={category.name}
                    active={activeCategory === category.slug}
                    onPress={() => selectCategory(category.slug)}
                    styles={styles}
                  />
                ))}
              </ScrollView>
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>Sort</Text>
                <Pressable accessibilityRole="button" onPress={() => setSortOpen(true)} style={styles.sortSelect}>
                  <Text style={styles.sortValue}>{selectedSort.label}</Text>
                  <ChevronDown size={16} strokeWidth={1.75} color={theme.inkSoft} />
                </Pressable>
                {activeCategory || search ? (
                  <Pressable onPress={() => router.replace('/')} style={styles.clearButton}>
                    <Text style={styles.clearLabel}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {error ? <Notice>{error}</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? <Text style={styles.empty}>Loading catalogue…</Text> : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing matches that</Text>
              <Text style={styles.empty}>Try a broader search or clear the filters.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Link href={`/product/${item.id}`} style={styles.productLink}>
              <View style={styles.imageFrame}>
                {resolveProductImageUrl(item.image_url) ? (
                  <Image
                    source={{ uri: resolveProductImageUrl(item.image_url) ?? undefined }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : null}
                {item.stock_quantity <= 0 ? (
                  <Text style={styles.stockBadge}>SOLD OUT</Text>
                ) : item.stock_quantity <= 3 ? (
                  <Text style={styles.lowStockBadge}>{item.stock_quantity} LEFT</Text>
                ) : null}
              </View>
              <Text style={styles.categoryName}>{item.categoryName ?? ''}</Text>
              <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
            </Link>
            <View style={styles.priceRow}>
              <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.price}>
                {money(item.price_cents)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.stock_quantity <= 0 ? `${item.name} is out of stock` : `Add ${item.name} to cart`}
                disabled={item.stock_quantity <= 0}
                onPress={() => add(item.id)}
                style={[styles.addButton, item.stock_quantity <= 0 && styles.addDisabled]}
              >
                <Plus size={14} strokeWidth={1.75} color={theme.ink} />
                <Text style={styles.addLabel}>Add</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={<View style={styles.footer} />}
      />
      <Modal transparent visible={sortOpen} animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSortOpen(false)}>
          <View style={styles.sortMenu}>
            {SORT_OPTIONS.map((option) => (
              <Pressable key={option.value} onPress={() => selectSort(option.value)} style={styles.sortOption}>
                <Text style={[styles.sortOptionLabel, sort === option.value && styles.sortOptionActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.categoryChip, active && styles.categoryActive]}>
      <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme, narrowCard: boolean) {
  return StyleSheet.create({
  list: {
    paddingHorizontal: 19,
    paddingTop: 43,
    paddingBottom: 32,
    gap: 36,
  },
  gridRow: {
    gap: 20,
  },
  catalogIntro: {
    gap: 9,
    marginBottom: 42,
  },
  eyebrow: {
    color: theme.inkMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  count: {
    marginTop: 4,
    color: theme.inkSoft,
    fontSize: 14,
  },
  filters: {
    marginHorizontal: -19,
    paddingHorizontal: 19,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.line,
    gap: 12,
  },
  categories: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryChip: {
    minHeight: 32,
    borderRadius: 2,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryActive: {
    backgroundColor: theme.ink,
  },
  categoryLabel: {
    color: theme.inkSoft,
    fontSize: 12,
  },
  categoryLabelActive: {
    color: theme.onInk,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortLabel: {
    color: theme.inkMuted,
    fontSize: 12,
  },
  sortSelect: {
    height: 32,
    minWidth: 132,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: theme.lineStrong,
    backgroundColor: theme.surface,
  },
  sortValue: {
    color: theme.ink,
    fontSize: 12,
  },
  clearButton: {
    marginLeft: 'auto',
    padding: 6,
  },
  clearLabel: {
    color: theme.inkSoft,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  card: {
    flex: 1,
    minWidth: 0,
  },
  productLink: {
  },
  imageFrame: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.canvas,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  stockBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    color: theme.onInk,
    backgroundColor: theme.ink,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  lowStockBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    color: theme.accentInk,
    backgroundColor: theme.surface,
    fontSize: 10,
    fontWeight: '600',
  },
  categoryName: {
    minHeight: 17,
    marginTop: 10,
    marginBottom: 2,
    color: theme.inkMuted,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  name: {
    color: theme.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  priceRow: {
    minHeight: 36,
    marginTop: 4,
    flexDirection: narrowCard ? 'column' : 'row',
    alignItems: narrowCard ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: narrowCard ? 6 : 4,
  },
  price: {
    flexShrink: 1,
    color: theme.ink,
    fontSize: narrowCard ? 12 : 13,
    fontVariant: ['tabular-nums'],
  },
  addButton: {
    width: narrowCard ? 64 : 62,
    minWidth: narrowCard ? 64 : 62,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: narrowCard ? 'flex-end' : 'auto',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: theme.lineStrong,
    backgroundColor: theme.surface,
  },
  addDisabled: {
    opacity: 0.45,
  },
  addLabel: {
    color: theme.ink,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: {
    color: theme.ink,
    fontSize: 17,
    fontWeight: '600',
  },
  empty: {
    color: theme.inkMuted,
    fontSize: 13,
  },
  footer: {
    height: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sortMenu: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderColor: theme.line,
  },
  sortOption: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: theme.line,
  },
  sortOptionLabel: {
    color: theme.inkSoft,
    fontSize: 15,
  },
  sortOptionActive: {
    color: theme.ink,
    fontWeight: '600',
  },
  });
}
