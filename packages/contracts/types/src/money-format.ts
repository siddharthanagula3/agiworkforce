export function currencyMinorUnitDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency: currency.trim().toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function formatBillingMoney(
  minorUnits: number,
  currency: string,
  options?: { trimWholeUnits?: boolean },
): string {
  const code = currency.trim().toUpperCase();
  try {
    const divisor = 10 ** currencyMinorUnitDigits(code);
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

export function formatUsdAmount(amountUsd: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountUsd);
}
