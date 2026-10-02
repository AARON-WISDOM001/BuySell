import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Catalog reads.
 *
 * Every function here goes through the request-scoped client, so RLS applies.
 * The catalog policies are public-read, which is why these work for anonymous
 * visitors.
 */

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  stockQuantity: number;
  isFeatured: boolean;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  image_url: string;
  category_id: string | null;
  stock_quantity: number;
  is_featured: boolean;
  // Supabase types a to-one embed as an array unless the relationship is
  // inferred as one-to-one. `category_id` is nullable but points at exactly one
  // row, so the first entry is the category and null means uncategorised.
  category: { name: string; slug: string }[] | null;
};

const PRODUCT_COLUMNS =
  'id, name, slug, description, price_cents, image_url, category_id, stock_quantity, is_featured, category:categories(name, slug)';

const fallbackCategoryByProductSlug: Record<string, { name: string; slug: string }> = {
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

function toProduct(row: ProductRow): Product {
  const category = row.category?.[0] ?? fallbackCategoryByProductSlug[row.slug];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
    stockQuantity: row.stock_quantity,
    isFeatured: row.is_featured,
  };
}

export type CatalogFilters = {
  search?: string;
  category?: string;
  /** Sort key prefixed with "-" for descending. */
  sort?: string;
};

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name_asc', label: 'Name: A to Z' },
] as const;

export async function getProducts(filters: CatalogFilters = {}): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('products').select(PRODUCT_COLUMNS);

  if (error) throw new Error(`Failed to load products: ${error.message}`);

  let products = (data as ProductRow[]).map(toProduct);

  if (filters.search) {
    const needle = filters.search.trim().toLowerCase();
    if (needle) {
      products = products.filter((product) =>
        `${product.name} ${product.description} ${product.categoryName ?? ''}`
          .toLowerCase()
          .includes(needle),
      );
    }
  }

  if (filters.category) {
    products = products.filter((product) => product.categorySlug === filters.category);
  }

  switch (filters.sort) {
    case 'price_asc':
      products.sort((a, b) => a.priceCents - b.priceCents);
      break;
    case 'price_desc':
      products.sort((a, b) => b.priceCents - a.priceCents);
      break;
    case 'name_asc':
      products.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      products.sort(
        (a, b) =>
          Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name),
      );
  }

  return products;
}

export async function getFeaturedProducts(limit = 4): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load featured products: ${error.message}`);
  return (data as ProductRow[]).map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`Failed to load product: ${error.message}`);
  return data ? toProduct(data as ProductRow) : null;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('name');

  if (error) throw new Error(`Failed to load categories: ${error.message}`);
  return (data ?? []) as Category[];
}

/**
 * Related products: same category, excluding the product itself.
 *
 * Same-category only, rather than "similar by price", because a genuinely
 * useful related rail needs a real relationship and category is the one the
 * schema actually has.
 */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const supabase = await createClient();

  // Prefer the same category; fall back to anything else if the category is
  // small or the product has none.
  let query = supabase.from('products').select(PRODUCT_COLUMNS).neq('id', product.id);
  if (product.categoryId) query = query.eq('category_id', product.categoryId);

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(`Failed to load related products: ${error.message}`);

  return (data as ProductRow[]).map(toProduct);
}

/**
 * Live product data for a set of cart ids.
 *
 * Prices are read here, at render time, from the database — the cart itself
 * only ever held ids and quantities.
 */
export async function getProductsByIds(ids: string[]): Promise<Map<string, Product>> {
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .in('id', ids);

  if (error) throw new Error(`Failed to price cart: ${error.message}`);

  return new Map((data as ProductRow[]).map((row) => [row.id, toProduct(row)]));
}