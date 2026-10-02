import Image from 'next/image';
import Link from 'next/link';
import { formatCents } from '@/lib/money';
import type { Product } from '@/lib/catalog';

/**
 * Product card.
 *
 * The whole image+name block is one link, and the price sits outside it, so the
 * "Add to cart" control is never nested inside an anchor. Nesting interactive
 * elements is the most common accessibility failure in a product grid.
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

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="text-[15px] tabular-nums text-ink">{formatCents(product.priceCents)}</p>
      </div>
    </article>
  );
}
