import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, SectionHeading } from '@/components/ui/layout';
import { ProductCard } from '@/components/product/product-card';
import { CatalogSort } from '@/components/product/catalog-sort';
import { CurrencyAmount } from '@/components/currency-provider';
import { SORT_OPTIONS, getCategories, getProducts } from '@/lib/catalog';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Shop',
};

/**
 * Storefront.
 *
 * Filtering, search and sorting are handled by searchParams and the database,
 * not by client state — so every view is shareable, and the server renders the
 * final list rather than shipping the whole catalogue to the browser to filter.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSearch = typeof params.q === 'string' ? params.q : undefined;
  const search = rawSearch?.trim() || undefined;
  const category = typeof params.category === 'string' ? params.category : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;

  const [products, categories] = await Promise.all([getProducts({ search, category, sort }), getCategories()]);

  const activeCategory = categories.find((item) => item.slug === category);
  const isFiltered = Boolean(search || category);

  return (
    <>
      <section className="border-b border-line">
        <Container className="pb-14 pt-14 sm:pb-20 sm:pt-24">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Desk &amp; audio
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-[56px]">
            A short list of things that earn their place.
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
            A focused selection chosen for how it holds up after a year. Free shipping over{' '}
            <CurrencyAmount cents={FREE_SHIPPING_THRESHOLD_CENTS} />, and no payment is taken until we have
            confirmed dispatch.
          </p>
        </Container>
      </section>

      <Container className="py-12 sm:py-16">
        {products.length > 0 ? (
          <SectionHeading
            eyebrow={activeCategory ? activeCategory.name : search ? 'Search' : 'Catalogue'}
            title={
              activeCategory
                ? activeCategory.name
                : search
                  ? `Results for “${search}”`
                  : 'Everything in stock'
            }
            description={`${products.length} ${products.length === 1 ? 'product' : 'products'}`}
            live
            action={
              isFiltered ? (
                <Link
                  href="/"
                  className="text-sm text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink"
                >
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        ) : null}

        <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Product categories">
            <ul className="flex flex-wrap items-center gap-1">
              <li>
                <Link
                  href="/"
                  aria-current={!category ? 'page' : undefined}
                  className={`inline-flex h-8 items-center rounded-xs px-3 text-[13px] transition-colors duration-150 ${
                    !category
                      ? 'bg-ink text-on-ink'
                      : 'text-ink-soft hover:bg-canvas hover:text-ink'
                  }`}
                >
                  All
                </Link>
              </li>
              {categories.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/?category=${item.slug}`}
                    aria-current={category === item.slug ? 'page' : undefined}
                    className={`inline-flex h-8 items-center rounded-xs px-3 text-[13px] transition-colors duration-150 ${
                      category === item.slug
                        ? 'bg-ink text-on-ink'
                        : 'text-ink-soft hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form action="/" className="flex items-center gap-2">
            {search ? <input type="hidden" name="q" value={search} /> : null}
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <label htmlFor="sort" className="text-[13px] text-ink-muted">
              Sort
            </label>
            <CatalogSort options={SORT_OPTIONS} value={sort ?? 'featured'} />
            <noscript>
              <button
                type="submit"
                className="h-8 rounded-xs border border-line-strong px-3 text-[13px]"
              >
                Apply
              </button>
            </noscript>
          </form>
        </div>

        {products.length === 0 ? (
          <div className="mt-16 border border-line bg-surface px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">Nothing matches that</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
              {search
                ? `We could not find anything for “${search}”. Try a broader term, or browse the full catalogue.`
                : 'This category is empty right now. Try another one.'}
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-10 items-center rounded-xs bg-ink px-5 text-sm font-medium text-on-ink transition-colors hover:bg-ink-soft"
            >
              Browse everything
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        )}
      </Container>
    </>
  );
}
