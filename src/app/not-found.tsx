import Link from 'next/link';
import { Container } from '@/components/ui/layout';

export default function NotFound() {
  return (
    <Container className="py-24 sm:py-32">
      <div className="mx-auto max-w-md border border-line bg-surface px-6 py-14 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold">We could not find that</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The page may have moved, or the product may have been withdrawn from the catalogue.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-10 items-center rounded-xs bg-ink px-5 text-sm font-medium text-on-ink transition-colors hover:bg-ink-soft"
        >
          Back to the shop
        </Link>
      </div>
    </Container>
  );
}
