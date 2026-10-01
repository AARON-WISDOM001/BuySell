import type { Metadata } from 'next';
import { Container, PageHeader } from '@/components/ui/layout';
import { storeName } from '@/lib/env';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <Container size="narrow" className="py-12 sm:py-16">
      <PageHeader eyebrow="About" title="A short catalogue on purpose" />

      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-ink-soft">
        <p>
          {storeName()} exists because most shops make you work. The catalogue is short on purpose:
          everything here has been used long enough to know whether it holds up.
        </p>

        <p>
          We do not run flash sales or manufacture urgency. When something is out of stock it says
          so, and when stock is low it says that too.
        </p>

        <h2 className="pt-4 text-lg font-semibold text-ink">How ordering works</h2>
        <p>
          Placing an order reserves your items and records it in our system. No payment is taken
          online — we will contact you to arrange payment and shipping before anything is
          dispatched. You will get a confirmation by email straight away, and the order will stay
          visible in your account.
        </p>

        <h2 className="pt-4 text-lg font-semibold text-ink">Shipping</h2>
        <p>
          Free on orders over $150. Below that it is a flat $9. Dispatch is three to five working
          days after payment is arranged.
        </p>

        <h2 className="pt-4 text-lg font-semibold text-ink">Returns</h2>
        <p>
          Thirty days, unused and in the original packaging. If something is not right, tell us and
          we will sort it out — no forms, no restocking fee.
        </p>
      </div>
    </Container>
  );
}
