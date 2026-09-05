import 'server-only';

import { getKeyValueStore } from '@/lib/server/key-value';

export const GOOGLE_GROUNDING_MONTHLY_POOL_ENV = 'AGI_GOOGLE_GROUNDING_MONTHLY_POOL';
const DEFAULT_GOOGLE_GROUNDING_MONTHLY_POOL = 5_000;
const POOL_KEY_TTL_SECONDS = 40 * 24 * 60 * 60;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

export function resolveGoogleGroundingMonthlyPool(): number {
  return envInt(
    GOOGLE_GROUNDING_MONTHLY_POOL_ENV,
    DEFAULT_GOOGLE_GROUNDING_MONTHLY_POOL,
    0,
    1_000_000,
  );
}

function monthKey(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function poolKey(provider: string, now: Date): string {
  return `grounding-pool:${provider}:${monthKey(now)}`;
}

export interface GroundingPoolStatus {
  used: number;
  limit: number;
  withinPool: boolean;
}

/**
 * Read-only view of this month's grounded-request count for `provider`,
 * against `resolveGoogleGroundingMonthlyPool`'s limit. A missing key-value
 * backend fails open (`withinPool: true`): a quota gate that cannot read its
 * own counter must not block every search-enabled turn.
 */
export async function peekGroundingPool(
  provider: string,
  now: Date = new Date(),
): Promise<GroundingPoolStatus> {
  const limit = resolveGoogleGroundingMonthlyPool();
  const store = getKeyValueStore();
  if (!store) return { used: 0, limit, withinPool: true };
  const used = (await store.get<number>(poolKey(provider, now))) ?? 0;
  return { used, limit, withinPool: used < limit };
}

export interface GroundingPoolReservation {
  before: number;
  after: number;
  billableCalls: number;
}

/**
 * Records `count` grounded responses observed this turn against the monthly
 * counter and returns how many landed beyond the pool, the portion COGS
 * should actually price. A missing key-value backend fails open: every call
 * is reported as within-pool rather than silently unbillable or silently
 * blocking the turn.
 */
export async function reserveGroundingPoolUses(
  provider: string,
  count: number,
  now: Date = new Date(),
): Promise<GroundingPoolReservation> {
  if (!Number.isFinite(count) || count <= 0) return { before: 0, after: 0, billableCalls: 0 };
  const limit = resolveGoogleGroundingMonthlyPool();
  const store = getKeyValueStore();
  if (!store) return { before: 0, after: 0, billableCalls: 0 };
  const key = poolKey(provider, now);
  const after = await store.increment(key, count);
  if (after === count) await store.expire(key, POOL_KEY_TTL_SECONDS);
  const before = after - count;
  const billableCalls = Math.max(0, after - Math.max(limit, before));
  return { before, after, billableCalls };
}
