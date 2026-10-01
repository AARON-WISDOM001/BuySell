import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { CartProvider } from '@/components/cart/cart-context';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { getUser } from '@/lib/supabase/server';
import { NotConfigured } from '@/components/not-configured';
import { siteUrl, storeName } from '@/lib/env';
import './globals.css';

/**
 * DM Sans: one family for the whole interface. A serif display face was
 * evaluated and rejected — high-contrast serifs degrade below 24px, and a
 * second font is a second thing to get wrong for very little visual return.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${storeName()} — considered goods for work and home`,
    template: `%s · ${storeName()}`,
  },
  description:
    'A small, deliberate catalogue of desk and audio equipment. Honest materials, fair prices, no gimmicks.',
  openGraph: {
    title: storeName(),
    description: 'A small, deliberate catalogue of desk and audio equipment.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#fafaf9',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;

  // Configuration problems are surfaced as a setup screen rather than a stack
  // trace, so a fresh clone with no .env.local is immediately understandable.
  try {
    user = await getUser();
  } catch (error) {
    const missing = error instanceof Error && error.message.startsWith('Missing environment');
    if (!missing) throw error;

    return (
      <html lang="en" className={dmSans.variable}>
        <body className="min-h-screen">
          <NotConfigured missingVariable={error.message} />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" className={dmSans.variable}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="focusable-sr-only absolute left-4 top-4 z-50 rounded-xs bg-ink px-4 py-2 text-sm text-white"
        >
          Skip to content
        </a>

        <CartProvider>
          <SiteHeader user={user} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
