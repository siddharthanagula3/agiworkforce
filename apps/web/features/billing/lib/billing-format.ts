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

function currencyFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatBillingMoney(
  minorUnits: number,
  currency: string,
  options?: { trimWholeUnits?: boolean },
): string {
  const code = currency.trim().toUpperCase();
  try {
    const divisor = 10 ** currencyFractionDigits(code);
    const whole = options?.trimWholeUnits === true && minorUnits % divisor === 0;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(minorUnits / divisor);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${code}`;
  }
}

export function formatRecurringMoney(
  minorUnits: number,
  currency: string,
  interval: 'monthly' | 'yearly',
): string {
  const amount = formatBillingMoney(minorUnits, currency, { trimWholeUnits: true });
  return `${amount}/${interval === 'yearly' ? 'year' : 'month'}`;
}

export function formatUsdAmount(amountUsd: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountUsd);
}

export function formatRatio(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
