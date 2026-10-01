import { Container } from '@/components/ui/layout';

export default function Loading() {
  return (
    <Container className="py-12 sm:py-16" aria-busy="true">
      <p className="focusable-sr-only" role="status">
        Loading
      </p>
      <div className="h-10 w-2/3 animate-pulse bg-line" />
      <div className="mt-4 h-4 w-1/3 animate-pulse bg-line" />
      <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <div className="aspect-4/5 animate-pulse bg-line" />
            <div className="mt-3 h-4 w-2/3 animate-pulse bg-line" />
            <div className="mt-2 h-4 w-1/4 animate-pulse bg-line" />
          </div>
        ))}
      </div>
    </Container>
  );
}
