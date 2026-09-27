import { CENTS_PER_USD, CREDITS_PER_CENT, creditsFromCents, formatCredits } from './credits';

export { CENTS_PER_USD, creditsFromCents };

export const TOP_UP_UNITS_PER_USD = 50;
export const MIN_TOP_UP_AMOUNT_USD = 20;
export const MAX_TOP_UP_AMOUNT_USD = 1_000;
export const DAILY_TOP_UP_LIMIT_USD = 2_000;
export const AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT = 5;
export const AUTO_RELOAD_MIN_THRESHOLD_CREDITS = 100;
export const AUTO_RELOAD_MAX_THRESHOLD_CREDITS = 100_000;
export const AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS = 500;
export const TOP_UP_PRESET_AMOUNTS_USD = [20, 50, 100, 250, 1_000] as const;
export const TOP_UP_CONVERSION = 'usd_1_to_credits_50_v2';
export const LEGACY_TOP_UP_CONVERSION = 'usd_1_to_units_50_v1';

const TOP_UP_DISCOUNT_BRACKETS: ReadonlyArray<{ fromUsd: number; percent: number }> = [
  { fromUsd: 1_000, percent: 30 },
  { fromUsd: 250, percent: 20 },
  { fromUsd: 100, percent: 10 },
  { fromUsd: 50, percent: 5 },
  { fromUsd: 0, percent: 0 },
];

export interface TopUpQuote {
  amountUsd: number;
  credits: number;
  discountPercent: number;
  priceCents: number;
  budgetCents: number;
  autoReload: boolean;
}

export function isTopUpAmountUsd(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= MIN_TOP_UP_AMOUNT_USD &&
    value <= MAX_TOP_UP_AMOUNT_USD
  );
}

export function topUpUnitsForUsd(amountUsd: unknown): number | null {
  if (typeof amountUsd !== 'number' || !Number.isSafeInteger(amountUsd) || amountUsd <= 0) {
    return null;
  }
  return amountUsd * TOP_UP_UNITS_PER_USD;
}

export function topUpDiscountPercent(
  amountUsd: number,
  options?: { autoReload?: boolean },
): number {
  const bracket =
    TOP_UP_DISCOUNT_BRACKETS.find((entry) => amountUsd >= entry.fromUsd)?.percent ?? 0;
  return bracket + (options?.autoReload ? AUTO_RELOAD_EXTRA_DISCOUNT_PERCENT : 0);
}

export function topUpBudgetCentsForCredits(credits: number): number {
  return credits / CREDITS_PER_CENT;
}

export function quoteTopUp(
  amountUsd: unknown,
  options?: { autoReload?: boolean },
): TopUpQuote | null {
  if (!isTopUpAmountUsd(amountUsd)) return null;
  const credits = amountUsd * TOP_UP_UNITS_PER_USD;
  const autoReload = options?.autoReload === true;
  const discountPercent = topUpDiscountPercent(amountUsd, { autoReload });
  return {
    amountUsd,
    credits,
    discountPercent,
    priceCents: Math.round((amountUsd * CENTS_PER_USD * (100 - discountPercent)) / 100),
    budgetCents: topUpBudgetCentsForCredits(credits),
    autoReload,
  };
}

export function topUpLedgerCentsForUsd(amountUsd: unknown): number | null {
  const credits = topUpUnitsForUsd(amountUsd);
  return credits === null ? null : topUpBudgetCentsForCredits(credits);
}

export interface TopUpPurchaseRecord {
  conversion?: unknown;
  amountCents: unknown;
  units: unknown;
  priceCents?: unknown;
  amountUsd?: unknown;
  autoReload?: unknown;
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isValidTopUpPurchase(record: TopUpPurchaseRecord): boolean {
  if (!isWholeNumber(record.amountCents) || !isWholeNumber(record.units)) return false;
  if (record.conversion === LEGACY_TOP_UP_CONVERSION || record.conversion === undefined) {
    return record.amountCents % CENTS_PER_USD === 0 && record.amountCents === record.units * 2;
  }
  if (record.conversion !== TOP_UP_CONVERSION) return false;
  const quote = quoteTopUp(record.amountUsd, { autoReload: record.autoReload === true });
  return (
    quote !== null &&
    quote.credits === record.units &&
    quote.budgetCents === record.amountCents &&
    quote.priceCents === record.priceCents
  );
}

export function topUpChargedCents(record: TopUpPurchaseRecord): number | null {
  if (!isValidTopUpPurchase(record)) return null;
  if (record.conversion === TOP_UP_CONVERSION) return record.priceCents as number;
  return record.amountCents as number;
}

export function isAutoReloadThresholdCredits(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= AUTO_RELOAD_MIN_THRESHOLD_CREDITS &&
    value <= AUTO_RELOAD_MAX_THRESHOLD_CREDITS
  );
}

export const AUTO_RELOAD_CONSENT_VERSION = '2026-09-27';

export interface AutoReloadCard {
  brand: string;
  last4: string;
}

export interface AutoReloadSettings {
  enabled: boolean;
  thresholdCredits: number;
  amountUsd: number;
  paymentMethod: AutoReloadCard | null;
  lastFailure: { at: string; reason: string } | null;
  consent: { version: string; acceptedAt: string } | null;
}

export interface AutoReloadSettingsUpdate {
  enabled: boolean;
  thresholdCredits: number;
  amountUsd: number;
  consentVersion?: string;
}

export function isValidAutoReloadSettingsUpdate(value: unknown): value is AutoReloadSettingsUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Record<string, unknown>;
  return (
    typeof update['enabled'] === 'boolean' &&
    isAutoReloadThresholdCredits(update['thresholdCredits']) &&
    isTopUpAmountUsd(update['amountUsd']) &&
    (update['consentVersion'] === undefined || typeof update['consentVersion'] === 'string')
  );
}

function formatChargeUsd(cents: number): string {
  const fractionDigits = cents % CENTS_PER_USD === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / CENTS_PER_USD);
}

function cardLabel(card: AutoReloadCard): string {
  return `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} ending in ${card.last4}`;
}

export function autoReloadConsentText(terms: {
  amountUsd: number;
  thresholdCredits: number;
  card: AutoReloadCard;
}): string | null {
  const quote = quoteTopUp(terms.amountUsd, { autoReload: true });
  if (!quote) return null;
  const threshold = formatCredits(terms.thresholdCredits);
  return [
    `By turning on auto-reload, you authorize AGI Workforce to charge your default card, currently ${cardLabel(terms.card)}, ${formatChargeUsd(quote.priceCents)} plus any applicable tax for ${formatCredits(quote.credits)} each time your purchased and bonus credits fall below ${threshold}.`,
    `This can repeat, up to ${formatChargeUsd(DAILY_TOP_UP_LIMIT_USD * CENTS_PER_USD)} of top-ups a day.`,
    `If your balance is already below ${threshold}, the first charge may happen right away.`,
    'We email a receipt for every charge. If a charge fails, auto-reload turns off and we email you.',
    'You can turn off auto-reload at any time in Settings > Billing, which stops future charges.',
  ].join(' ');
}
