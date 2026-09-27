export const MICROUSD_PER_USD = 1_000_000;
export const CENTS_PER_USD = 100;
export const MICROUSD_PER_CREDIT = 5_000;
export const CREDITS_PER_USD = MICROUSD_PER_USD / MICROUSD_PER_CREDIT;
export const CENTS_PER_CREDIT = CENTS_PER_USD / CREDITS_PER_USD;
export const CREDITS_PER_CENT = CREDITS_PER_USD / CENTS_PER_USD;

export function creditsFromMicrousd(microusd: number): number {
  return microusd / MICROUSD_PER_CREDIT;
}

export function creditsFromCents(cents: number): number {
  return cents * CREDITS_PER_CENT;
}

export function microusdFromCredits(credits: number): number {
  return credits * MICROUSD_PER_CREDIT;
}

export function centsFromCredits(credits: number): number {
  return credits * CENTS_PER_CREDIT;
}

export function usdFromCredits(credits: number): number {
  return credits / CREDITS_PER_USD;
}

export function chargeCreditsForMicrousd(microusd: number): number {
  if (!Number.isFinite(microusd) || microusd <= 0) return 0;
  return Math.ceil((microusd / MICROUSD_PER_CREDIT) * 100) / 100;
}

export function formatCredits(
  credits: number,
  options?: { maximumFractionDigits?: number },
): string {
  const maximumFractionDigits = options?.maximumFractionDigits ?? 1;
  const formatted = credits.toLocaleString('en-US', { maximumFractionDigits });
  return `${formatted} ${credits === 1 ? 'credit' : 'credits'}`;
}

export function formatCreditsPerMillionTokens(usdPerMillionTokens: number): number {
  return usdPerMillionTokens * CREDITS_PER_USD;
}
