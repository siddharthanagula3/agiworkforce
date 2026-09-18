import 'server-only';

import { MAX_PURCHASABLE_SEATS } from '@agiworkforce/types';

import type {
  NormalizedEnvironment,
  NormalizedInterval,
  NormalizedMoney,
  NormalizedPeriod,
  NormalizedPurchaseState,
  NormalizedSubscriptionStatus,
  PaymentProviderId,
} from './domain';

export type ProviderEpochUnit = 'seconds' | 'milliseconds';

const CURRENCY_CODE_PATTERN = /^[a-z]{3}$/i;

const STRIPE_SUBSCRIPTION_STATUS: Readonly<Record<string, NormalizedSubscriptionStatus>> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  incomplete_expired: 'incomplete_expired',
  unpaid: 'unpaid',
  paused: 'unpaid',
};

const APPLE_SUBSCRIPTION_STATUS: Readonly<Record<string, NormalizedSubscriptionStatus>> = {
  '1': 'active',
  '2': 'canceled',
  '3': 'past_due',
  '4': 'past_due',
  '5': 'canceled',
  active: 'active',
  expired: 'canceled',
  revoked: 'canceled',
};

const GOOGLE_SUBSCRIPTION_STATUS: Readonly<Record<string, NormalizedSubscriptionStatus>> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'past_due',
  SUBSCRIPTION_STATE_ON_HOLD: 'unpaid',
  SUBSCRIPTION_STATE_PAUSED: 'unpaid',
  SUBSCRIPTION_STATE_CANCELED: 'active',
  SUBSCRIPTION_STATE_EXPIRED: 'canceled',
  SUBSCRIPTION_STATE_PENDING: 'incomplete',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'incomplete_expired',
  SUBSCRIPTION_STATE_UNSPECIFIED: 'none',
};

const SUBSCRIPTION_STATUS_BY_PROVIDER: Readonly<
  Record<PaymentProviderId, Readonly<Record<string, NormalizedSubscriptionStatus>>>
> = {
  stripe: STRIPE_SUBSCRIPTION_STATUS,
  apple: APPLE_SUBSCRIPTION_STATUS,
  google: GOOGLE_SUBSCRIPTION_STATUS,
};

/**
 * An unmapped provider status must not silently read as entitled: it lands on
 * `unpaid`, which every entitlement check already treats as not-paid, and the
 * caller logs the raw value so the mapping above can be extended.
 */
export const UNMAPPED_SUBSCRIPTION_STATUS: NormalizedSubscriptionStatus = 'unpaid';

export function normalizeSubscriptionStatus(
  provider: PaymentProviderId,
  rawStatus: string | number | null | undefined,
): { status: NormalizedSubscriptionStatus; mapped: boolean } {
  if (rawStatus === null || rawStatus === undefined) return { status: 'none', mapped: false };
  const key = String(rawStatus).trim();
  if (key === '') return { status: 'none', mapped: false };
  const table = SUBSCRIPTION_STATUS_BY_PROVIDER[provider];
  const mapped = table[key] ?? table[key.toLowerCase()] ?? table[key.toUpperCase()];
  return mapped
    ? { status: mapped, mapped: true }
    : { status: UNMAPPED_SUBSCRIPTION_STATUS, mapped: false };
}

export function normalizePurchaseState(
  status: NormalizedSubscriptionStatus,
  expiresAt: Date | null,
  now = Date.now(),
): NormalizedPurchaseState {
  if (status === 'canceled' || status === 'incomplete_expired') return 'expired';
  if (status === 'incomplete') return 'processing';
  if (status === 'unpaid' || status === 'past_due' || status === 'none') return 'unpaid';
  if (expiresAt !== null && expiresAt.getTime() <= now) return 'expired';
  return 'paid';
}

export function normalizeProviderTimestamp(
  value: number | string | Date | null | undefined,
  unit: ProviderEpochUnit = 'seconds',
): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(unit === 'seconds' ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^-?\d+$/.test(trimmed)) return normalizeProviderTimestamp(Number(trimmed), unit);
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function normalizeProviderPeriod(
  start: number | string | Date | null | undefined,
  end: number | string | Date | null | undefined,
  unit: ProviderEpochUnit = 'seconds',
): NormalizedPeriod | null {
  const startsAt = normalizeProviderTimestamp(start, unit);
  const endsAt = normalizeProviderTimestamp(end, unit);
  if (!startsAt || !endsAt || endsAt.getTime() < startsAt.getTime()) return null;
  return { startsAt, endsAt };
}

const SMALLEST_PURCHASABLE_QUANTITY = 1;

export function normalizeProviderQuantity(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return SMALLEST_PURCHASABLE_QUANTITY;
  }
  if (parsed < SMALLEST_PURCHASABLE_QUANTITY) return SMALLEST_PURCHASABLE_QUANTITY;
  return Math.min(parsed, MAX_PURCHASABLE_SEATS);
}

export function normalizeCurrency(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !CURRENCY_CODE_PATTERN.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export function normalizeMoney(
  minorUnits: number | string | null | undefined,
  currency: string | null | undefined,
): NormalizedMoney | null {
  const code = normalizeCurrency(currency);
  if (!code) return null;
  const parsed = typeof minorUnits === 'string' ? Number(minorUnits) : minorUnits;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return { currency: code, minorUnits: parsed };
}

export function normalizeInterval(
  unit: string | null | undefined,
  count: number | null | undefined,
): NormalizedInterval | null {
  const key = unit?.trim().toLowerCase();
  if (key !== 'day' && key !== 'week' && key !== 'month' && key !== 'year') return null;
  const parsed = typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 1;
  return { unit: key, count: parsed };
}

export function normalizeEnvironment(value: unknown): NormalizedEnvironment {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return key === 'sandbox' || key === 'test' || key === 'staging' ? 'sandbox' : 'production';
}
