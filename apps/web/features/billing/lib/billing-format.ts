import { formatBillingMoney } from '@agiworkforce/types';

export { formatBillingMoney, formatUsdAmount } from '@agiworkforce/types';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

function toValidDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBillingDate(value: string | number | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(date) : null;
}

export function formatBillingDateFromSeconds(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? formatBillingDate(seconds * 1000)
    : null;
}

export function formatRecurringMoney(
  minorUnits: number,
  currency: string,
  interval: 'monthly' | 'yearly',
): string {
  const amount = formatBillingMoney(minorUnits, currency, { trimWholeUnits: true });
  return `${amount}/${interval === 'yearly' ? 'year' : 'month'}`;
}

export function formatRatio(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
