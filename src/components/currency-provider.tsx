'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { CURRENCY, formatCents, formatCentsInCurrency, type DisplayCurrency } from '@/lib/money';

const CurrencyContext = createContext<DisplayCurrency>({
  country: 'NG',
  currency: 'NGN',
  exchangeRate: 1328,
  locale: 'en-NG',
});

export function CurrencyProvider({
  config,
  children,
}: {
  config: DisplayCurrency;
  children: ReactNode;
}) {
  return <CurrencyContext.Provider value={config}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function useCurrencyFormatter() {
  const { currency, exchangeRate, locale } = useCurrency();
  return (cents: number) => formatCentsInCurrency(cents, currency, exchangeRate, locale);
}

export function CurrencyAmount({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const formatMoney = useCurrencyFormatter();
  return <span className={className}>{formatMoney(cents)}</span>;
}

/**
 * States the amount we actually charge when the display currency is converted.
 *
 * Orders record USD cents, so a converted total is indicative: once the rate
 * moves, the displayed figure and the recorded one differ. Showing the base
 * amount next to it keeps that honest rather than implied.
 */
export function CurrencyDisclosure({ cents }: { cents: number }) {
  const { currency } = useCurrency();
  if (currency === CURRENCY) return null;
  return (
    <p className="mt-3 text-[13px] text-ink-muted">
      Converted from {formatCents(cents)} at today&apos;s rate. We confirm the final amount before
      dispatch.
    </p>
  );
}