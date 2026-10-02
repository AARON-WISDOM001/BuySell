import 'server-only';

import { headers } from 'next/headers';
import { currencyForCountry, type DisplayCurrency } from '@/lib/money';

const fallbackRates: Record<string, number> = {
  AED: 3.67,
  AFN: 70,
  ALL: 92,
  AMD: 390,
  ARS: 1200,
  AUD: 1.52,
  AZN: 1.7,
  BDT: 120,
  BGN: 1.74,
  BHD: 0.377,
  BRL: 5.4,
  CAD: 1.36,
  CHF: 0.8,
  BYN: 3.3,
  CLP: 950,
  CNY: 7.1,
  COP: 4200,
  CZK: 22.5,
  DKK: 6.6,
  EGP: 50,
  EUR: 0.89,
  GEL: 2.7,
  GBP: 0.76,
  GHS: 15.5,
  HKD: 7.8,
  HUF: 365,
  IDR: 16000,
  INR: 83.5,
  ILS: 3.7,
  ISK: 140,
  JPY: 150,
  KES: 129,
  KRW: 1400,
  KWD: 0.31,
  KZT: 500,
  MAD: 10,
  MXN: 18,
  MYR: 4.5,
  NOK: 10.5,
  NGN: 1328,
  NZD: 1.66,
  NPR: 134,
  PKR: 280,
  PHP: 57,
  PLN: 4,
  QAR: 3.64,
  RON: 4.5,
  SAR: 3.75,
  SEK: 10.5,
  SGD: 1.35,
  THB: 34,
  TRY: 34,
  TWD: 32,
  UAH: 41,
  VND: 25000,
  ZAR: 18.2,
};

type ExchangeRateResponse = {
  result?: unknown;
  rates?: Record<string, unknown>;
};

function countryFromAcceptLanguage(value: string | null): string | null {
  const primaryLanguage = value?.split(',')[0]?.split(';')[0]?.trim();
  const match = primaryLanguage?.match(/^[a-z]{2,3}-([a-z]{2})$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function validCountry(value: string | null): string | null {
  const country = value?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
}

async function getExchangeRate(currency: string): Promise<number> {
  if (currency === 'USD') return 1;

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error('Exchange rate request failed');

    const data = (await response.json()) as ExchangeRateResponse;
    const rate = data.rates?.[currency];
    if (data.result !== 'success' || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('Exchange rate response was invalid');
    }
    return rate;
  } catch {
    return fallbackRates[currency] ?? 1;
  }
}

export type CurrencyConfig = DisplayCurrency;

export async function getCurrencyConfig(): Promise<CurrencyConfig> {
  const requestHeaders = await headers();
  const geoCountry = validCountry(
    requestHeaders.get('x-vercel-ip-country') ??
      requestHeaders.get('cf-ipcountry') ??
      requestHeaders.get('x-country-code'),
  );
  const localRequest = requestHeaders.get('host')?.startsWith('localhost');
  const country =
    geoCountry ??
    (localRequest ? 'NG' : countryFromAcceptLanguage(requestHeaders.get('accept-language'))) ??
    'NG';
  const currency = currencyForCountry(country);

  return {
    country,
    currency,
    locale: `en-${country}`,
    exchangeRate: await getExchangeRate(currency),
  };
}