import Image from 'next/image';
import Link from 'next/link';
import { CurrencyAmount } from '@/components/currency-provider';
import { QuickAdd } from '@/components/product/quick-add';
import type { Product } from '@/lib/catalog';

/**
 * Product card.
 *
 * The whole image+name block is one link; the price and Quick Add sit outside
 * it. Nesting a button inside an anchor is the most common accessibility
 * failure in a product grid, and it is also what would make Quick Add navigate
 * to the product page instead of adding.
 *
 * Quick Add is always present but transparent on pointer devices, revealing on
 * hover or keyboard focus of anything in the card. It is not `display: none`
 * when hidden, so it stays reachable by keyboard and in the tab order. Below
 * `sm` it is always opaque, because a touch device has no hover to reveal it.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const outOfStock = product.stockQuantity === 0;
  const lowStock = !outOfStock && product.stockQuantity <= 3;

  return (
    <article className="group flex flex-col">
      <Link
        href={`/products/${product.slug}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <div className="relative aspect-4/5 overflow-hidden rounded-xs border border-line bg-canvas">
          <Image
            src={product.imageUrl}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="product-photograph object-cover group-hover:scale-[1.025] group-focus-visible:scale-[1.025] motion-reduce:transform-none"
          />
          {outOfStock ? (
            <span className="absolute left-3 top-3 rounded-xs bg-ink px-2 py-1 text-[11px] font-medium tracking-[0.06em] text-white uppercase">
              Sold out
            </span>
          ) : lowStock ? (
            <span className="absolute left-3 top-3 rounded-xs bg-surface px-2 py-1 text-[11px] font-medium tracking-[0.06em] text-accent uppercase">
              {product.stockQuantity} left
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          {product.categoryName ? (
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              {product.categoryName}
            </p>
          ) : null}
          <h3 className="text-[15px] leading-snug font-medium text-ink">{product.name}</h3>
        </div>
      </Link>

      <div className="mt-1 flex min-h-8 items-center justify-between gap-3">
        <p className="text-[15px] tabular-nums text-ink">
          <CurrencyAmount cents={product.priceCents} />
        </p>

        {/* Outside the product link, so Quick Add never navigates. */}
        <QuickAdd
          productId={product.id}
          productName={product.name}
          maxQuantity={product.stockQuantity}
          disabled={outOfStock}
          className="shrink-0 transition-opacity duration-200 ease-out-soft motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        />
      </div>
    </article>
  );
}
