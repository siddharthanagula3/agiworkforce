export const TOP_UP_UNITS_PER_USD = 50;

export const MIN_TOP_UP_AMOUNT_USD = 10;

/** Default self-serve safety cap from the current billing decision. */
export const MAX_TOP_UP_AMOUNT_USD = 100;

export const TOP_UP_PRESET_AMOUNTS_USD = [10, 20, 50, 100] as const;

export function topUpUnitsForUsd(amountUsd: unknown): number | null {
  if (
    typeof amountUsd !== 'number' ||
    !Number.isSafeInteger(amountUsd) ||
    amountUsd < MIN_TOP_UP_AMOUNT_USD ||
    amountUsd > MAX_TOP_UP_AMOUNT_USD
  ) {
    return null;
  }
  return amountUsd * TOP_UP_UNITS_PER_USD;
}

export function topUpLedgerCentsForUsd(amountUsd: unknown): number | null {
  return topUpUnitsForUsd(amountUsd) === null ? null : (amountUsd as number) * 100;
}

export function isValidTopUpPurchase(input: { amountCents: unknown; units: unknown }): boolean {
  if (
    typeof input.amountCents !== 'number' ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents % 100 !== 0
  ) {
    return false;
  }
  const amountUsd = input.amountCents / 100;
  return (
    topUpLedgerCentsForUsd(amountUsd) === input.amountCents &&
    topUpUnitsForUsd(amountUsd) === input.units
  );
}
