/**
 * Money handling.
 *
 * Prices are integer cents everywhere — in Postgres, in the cart, in order
 * rows, and in email bodies. Floats are never used for money; the only place a
 * decimal point appears is this formatter.
 */

export const CURRENCY = 'USD';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
});

const currencyByCountry: Record<string, string> = {
  AE: 'AED',
  AF: 'AFN',
  AL: 'ALL',
  AM: 'AMD',
  AR: 'ARS',
  AT: 'EUR',
  AZ: 'AZN',
  BD: 'BDT',
  BG: 'BGN',
  BH: 'BHD',
  BR: 'BRL',
  AU: 'AUD',
  BE: 'EUR',
  BY: 'BYN',
  CA: 'CAD',
  CL: 'CLP',
  CH: 'CHF',
  CN: 'CNY',
  CO: 'COP',
  CY: 'EUR',
  CZ: 'CZK',
  DK: 'DKK',
  DE: 'EUR',
  EG: 'EGP',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GE: 'GEL',
  GB: 'GBP',
  GH: 'GHS',
  GR: 'EUR',
  HK: 'HKD',
  HR: 'EUR',
  HU: 'HUF',
  ID: 'IDR',
  IN: 'INR',
  IL: 'ILS',
  IE: 'EUR',
  IS: 'ISK',
  IT: 'EUR',
  JP: 'JPY',
  KR: 'KRW',
  KW: 'KWD',
  KE: 'KES',
  KZ: 'KZT',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MA: 'MAD',
  MX: 'MXN',
  MY: 'MYR',
  MT: 'EUR',
  NG: 'NGN',
  NO: 'NOK',
  NZ: 'NZD',
  NL: 'EUR',
  NP: 'NPR',
  PK: 'PKR',
  PH: 'PHP',
  PL: 'PLN',
  PT: 'EUR',
  QA: 'QAR',
  RO: 'RON',
  SA: 'SAR',
  SE: 'SEK',
  SG: 'SGD',
  TH: 'THB',
  TR: 'TRY',
  TW: 'TWD',
  UA: 'UAH',
  US: 'USD',
  VN: 'VND',
  SI: 'EUR',
  SK: 'EUR',
  ZA: 'ZAR',
};

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export type DisplayCurrency = {
  country: string;
  currency: string;
  exchangeRate: number;
  locale: string;
};

export function currencyForCountry(country: string | null | undefined): string {
  if (!country) return CURRENCY;
  return currencyByCountry[country.toUpperCase()] ?? CURRENCY;
}

export function formatCentsInCurrency(
  cents: number,
  currency: string,
  exchangeRate: number,
  locale: string,
): string {
  const key = `${locale}:${currency}`;
  let currencyFormatter = currencyFormatters.get(key);

  if (!currencyFormatter) {
    currencyFormatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'USD' ? 2 : 0,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, currencyFormatter);
  }

  return currencyFormatter.format((cents / 100) * exchangeRate);
}

/** 24900 -> "$249.00" */
export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** For inputs and anywhere a bare number is wanted: 24900 -> "249.00" */
export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}