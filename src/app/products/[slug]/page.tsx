import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Container, SectionHeading } from '@/components/ui/layout';
import { ProductCard } from '@/components/product/product-card';
import { ProductPurchasePanel } from '@/components/product/product-purchase-panel';
import { getProductBySlug, getRelatedProducts } from '@/lib/catalog';
import { formatCents } from '@/lib/money';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: 'Product not found' };

  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: { title: product.name, description: product.description.slice(0, 160) },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product);
  const soldOut = product.stockQuantity === 0;

  return (
    <>
      <Container size="wide" className="pt-6">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
            <li>
              <Link href="/" className="transition-colors hover:text-ink">
                Shop
              </Link>
            </li>
            {product.categorySlug ? (
              <>
                <li aria-hidden="true">
                  <ChevronRight size={13} strokeWidth={1.5} />
                </li>
                <li>
                  <Link
                    href={`/?category=${product.categorySlug}`}
                    className="transition-colors hover:text-ink"
                  >
                    {product.categoryName}
                  </Link>
                </li>
              </>
            ) : null}
            <li aria-hidden="true">
              <ChevronRight size={13} strokeWidth={1.5} />
            </li>
            <li aria-current="page" className="text-ink-soft">
              {product.name}
            </li>
          </ol>
        </nav>
      </Container>

      <Container size="wide" className="py-8 sm:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          <div className="group relative aspect-4/5 overflow-hidden rounded-xs border border-line bg-canvas sm:aspect-square lg:aspect-4/5">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="product-photograph object-cover group-hover:scale-[1.025] motion-reduce:transform-none"
            />
          </div>

          <div className="flex flex-col lg:py-4">
            {product.categoryName ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                {product.categoryName}
              </p>
            ) : null}

            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{product.name}</h1>

            <p className="mt-4 text-xl tabular-nums text-ink">{formatCents(product.priceCents)}</p>

            <div className="mt-4 flex items-center gap-2 text-[13px]">
              {soldOut ? (
                <span className="text-danger">Sold out</span>
              ) : product.stockQuantity <= 3 ? (
                <span className="text-accent">Only {product.stockQuantity} left</span>
              ) : (
                <span className="text-ink-muted">In stock</span>
              )}
            </div>

            <div className="mt-7">
              <ProductPurchasePanel
                productId={product.id}
                productName={product.name}
                stockQuantity={product.stockQuantity}
              />
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              Free shipping over {formatCents(15000)}. Payment is not taken at checkout — we will
              confirm dispatch with you first.
            </p>

            {product.description ? (
              <div className="mt-10 border-t border-line pt-8">
                <h2 className="text-[13px] font-medium uppercase tracking-[0.1em] text-ink-muted">
                  Details
                </h2>
                <p className="mt-3 leading-relaxed whitespace-pre-line text-ink-soft">
                  {product.description}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Container>

      {related.length > 0 ? (
        <section className="border-t border-line">
          <Container size="wide" className="py-14 sm:py-20">
            <SectionHeading title="Often bought with this" />
            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4 lg:gap-x-6">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </Container>
        </section>
      ) : null}
    </>
  );
}
