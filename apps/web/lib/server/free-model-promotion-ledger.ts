import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { KeyValueStore, RateLimiter } from '@agiworkforce/key-value';

import { logger } from '@/lib/logger';
import { getKeyValueRateLimiter } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';
import { sharedKeyValueStore } from '@/lib/server/shared-key-value-store';

import {
  loadFreeModelPromotionConfig,
  type FreeModelPromotion,
  type FreeModelPromotionCredential,
  type FreeModelPromotionReservation,
} from './free-model-promotion';

/**
 * The promotion's spend, held in the shared key-value store and reserved before
 * a provider is called, then settled to the measured cost. Increment first and
 * compare after, so concurrent turns cannot each read the same headroom and
 * both spend it; a turn that overshoots gives its increment straight back.
 *
 * Three counters bound it: the whole promotion, each credential's share, and
 * each account's message rate. A credential that shares its account with
 * managed traffic may only use what that traffic has left of its credit,
 * which is read from the provider cost ledger rather than from this store.
 */

const KEY_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MICROUSD_PER_CENT = 10_000;
const MILLISECONDS_PER_HOUR = 3_600_000;

export interface FreeModelPromotionLedger {
  store: KeyValueStore;
  limiter: RateLimiter;
  /** Spend on the managed key since the promotion began, or null when it cannot be measured. */
  managedSpendMicrousd(promotion: FreeModelPromotion, nowMs: number): Promise<number | null>;
}

function spendKey(promotionId: string): string {
  return `free-model-promotion:${promotionId}:spent`;
}

function credentialSpendKey(promotionId: string, credentialId: string): string {
  return `free-model-promotion:${promotionId}:credential:${credentialId}:spent`;
}

function credentialEndedKey(promotionId: string, credentialId: string): string {
  return `free-model-promotion:${promotionId}:credential:${credentialId}:ended`;
}

function searchKey(promotionId: string, userId: string): string {
  return `free-model-promotion:${promotionId}:searches:${userId}`;
}

function messageNamespace(promotionId: string): string {
  return `free-model-promotion:${promotionId}:messages`;
}

function retentionSeconds(promotion: Pick<FreeModelPromotion, 'endsAtMs'>, nowMs: number): number {
  return Math.max(1, Math.ceil((promotion.endsAtMs - nowMs) / 1_000)) + KEY_RETENTION_SECONDS;
}

function toCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

const MANAGED_SPEND_SQL = `
  select coalesce(sum(coalesce(provider_estimated_cost_microusd,
                               provider_cost_cents::bigint * $3)), 0)::bigint as spent_microusd
    from public.provider_cost_events
   where provider = $1
     and occurred_at >= $2`;

const managedSpendCache = new Map<string, { spentMicrousd: number; expiresAtMs: number }>();

export async function readManagedProviderSpendSince(
  provider: string,
  sinceMs: number,
  refreshMs: number,
  nowMs: number,
  db: DatabaseAdapter = getNeonDb(),
): Promise<number | null> {
  const cacheKey = `${provider}:${sinceMs}`;
  const cached = managedSpendCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs) return cached.spentMicrousd;
  try {
    const [row] = await db.query<{ spent_microusd: number | string }>(MANAGED_SPEND_SQL, [
      provider,
      new Date(sinceMs).toISOString(),
      MICROUSD_PER_CENT,
    ]);
    const spentMicrousd = Math.max(0, toCount(row?.spent_microusd));
    managedSpendCache.set(cacheKey, { spentMicrousd, expiresAtMs: nowMs + refreshMs });
    return spentMicrousd;
  } catch (error) {
    logger.warn({ error, provider }, '[free-model-promotion] managed spend could not be read');
    return null;
  }
}

export function resolveFreeModelPromotionLedger(): FreeModelPromotionLedger | null {
  const store = sharedKeyValueStore(process.env.NODE_ENV);
  const limiter = store ? getKeyValueRateLimiter() : null;
  if (!store || !limiter) return null;
  return {
    store,
    limiter,
    managedSpendMicrousd: (promotion, nowMs) =>
      readManagedProviderSpendSince(
        promotion.provider,
        promotion.startsAtMs,
        promotion.managedSpendRefreshMs,
        nowMs,
      ),
  };
}

async function credentialAllowanceMicrousd(
  ledger: FreeModelPromotionLedger,
  promotion: FreeModelPromotion,
  credential: FreeModelPromotionCredential,
  nowMs: number,
): Promise<number | null> {
  if (await ledger.store.get(credentialEndedKey(promotion.promotionId, credential.id))) {
    return null;
  }
  if (credential.isolated) return credential.creditMicrousd;
  const managedSpend = await ledger.managedSpendMicrousd(promotion, nowMs);
  return managedSpend === null ? null : credential.creditMicrousd - managedSpend;
}

async function incrementWithin(
  store: KeyValueStore,
  key: string,
  amount: number,
  limit: number,
  ttlSeconds: number,
): Promise<boolean> {
  const total = toCount(await store.increment(key, amount));
  await store.expire(key, ttlSeconds);
  if (total <= limit) return true;
  await store.increment(key, -amount);
  return false;
}

/**
 * Reserve one turn's spend, taking credentials in their configured order.
 * Null means this turn is not served by the promotion, for any reason: the
 * whole promotion is spent, every credential is spent or ended, the account is
 * over its message rate, or the store cannot be read. The caller then routes
 * the turn the way it would have without the promotion.
 */
export async function reserveFreeModelPromotionTurn(input: {
  promotion: FreeModelPromotion;
  userId: string;
  nowMs?: number;
  ledger?: FreeModelPromotionLedger | null;
}): Promise<FreeModelPromotionReservation | null> {
  const { promotion, userId } = input;
  const nowMs = input.nowMs ?? Date.now();
  const ledger = input.ledger === undefined ? resolveFreeModelPromotionLedger() : input.ledger;
  if (!ledger) return null;
  const amount = promotion.turnReserveMicrousd;
  const ttlSeconds = retentionSeconds(promotion, nowMs);
  const globalKey = spendKey(promotion.promotionId);

  try {
    for (const credential of promotion.credentials) {
      const allowance = await credentialAllowanceMicrousd(ledger, promotion, credential, nowMs);
      if (allowance === null || allowance < amount) continue;
      if (
        !(await incrementWithin(
          ledger.store,
          globalKey,
          amount,
          promotion.spendCeilingMicrousd,
          ttlSeconds,
        ))
      ) {
        return null;
      }
      const credentialKey = credentialSpendKey(promotion.promotionId, credential.id);
      if (!(await incrementWithin(ledger.store, credentialKey, amount, allowance, ttlSeconds))) {
        await ledger.store.increment(globalKey, -amount);
        continue;
      }
      const reservation: FreeModelPromotionReservation = {
        promotionId: promotion.promotionId,
        credentialId: credential.id,
        isolated: credential.isolated,
        reservedMicrousd: amount,
      };
      const verdict = await ledger.limiter.limit(messageNamespace(promotion.promotionId), userId, {
        limit: promotion.perUserMessages.limit,
        window: promotion.perUserMessages.window,
      });
      if (!verdict.success) {
        await settleFreeModelPromotionTurn(reservation, 0, ledger.store);
        return null;
      }
      return reservation;
    }
    return null;
  } catch (error) {
    logger.warn(
      { error, promotionId: promotion.promotionId },
      '[free-model-promotion] spend could not be reserved; the turn is routed without it',
    );
    return null;
  }
}

/**
 * Replace the reservation with the measured cost. Losing this write overstates
 * spend, which ends the promotion early: the safe direction, so it is logged
 * rather than retried.
 */
export async function settleFreeModelPromotionTurn(
  reservation: FreeModelPromotionReservation,
  actualMicrousd: number,
  store: KeyValueStore | null = sharedKeyValueStore(process.env.NODE_ENV),
): Promise<void> {
  const actual = Number.isFinite(actualMicrousd) ? Math.max(0, Math.ceil(actualMicrousd)) : 0;
  const delta = actual - reservation.reservedMicrousd;
  logger.info(
    {
      promotionId: reservation.promotionId,
      paidBy: reservation.credentialId,
      reservedMicrousd: reservation.reservedMicrousd,
      spentMicrousd: actual,
    },
    '[free-model-promotion] turn settled',
  );
  if (delta === 0 || !store) return;
  try {
    await store.increment(spendKey(reservation.promotionId), delta);
    await store.increment(
      credentialSpendKey(reservation.promotionId, reservation.credentialId),
      delta,
    );
  } catch (error) {
    logger.warn(
      { error, promotionId: reservation.promotionId, delta },
      '[free-model-promotion] settlement was not recorded',
    );
  }
}

/**
 * The provider refused this credential for money or authentication, so it
 * serves no further promoted turns. Every turn still holding a reservation on
 * it settles normally; only new turns move to the next credential.
 */
export async function endFreeModelPromotionCredential(
  reservation: Pick<FreeModelPromotionReservation, 'promotionId' | 'credentialId'>,
  promotion: Pick<FreeModelPromotion, 'endsAtMs'> | null,
  store: KeyValueStore | null = sharedKeyValueStore(process.env.NODE_ENV),
  nowMs: number = Date.now(),
): Promise<void> {
  if (!store) return;
  try {
    await store.set(credentialEndedKey(reservation.promotionId, reservation.credentialId), true, {
      ttlSeconds: promotion ? retentionSeconds(promotion, nowMs) : KEY_RETENTION_SECONDS,
    });
    logger.warn(
      { promotionId: reservation.promotionId, paidBy: reservation.credentialId },
      '[free-model-promotion] credential ended by the provider',
    );
  } catch (error) {
    logger.warn(
      { error, promotionId: reservation.promotionId, paidBy: reservation.credentialId },
      '[free-model-promotion] credential end was not recorded',
    );
  }
}

/**
 * Whether a new turn could still be reserved, for the copy that announces the
 * offer. It never authorises a turn: two readers can both see the last
 * headroom, and only `reserveFreeModelPromotionTurn` decides.
 */
export async function freeModelPromotionHasCapacity(
  promotion: FreeModelPromotion,
  nowMs: number = Date.now(),
  ledger: FreeModelPromotionLedger | null = resolveFreeModelPromotionLedger(),
): Promise<boolean> {
  if (!ledger) return false;
  try {
    const spent = toCount(await ledger.store.get(spendKey(promotion.promotionId)));
    if (spent + promotion.turnReserveMicrousd > promotion.spendCeilingMicrousd) return false;
    for (const credential of promotion.credentials) {
      const allowance = await credentialAllowanceMicrousd(ledger, promotion, credential, nowMs);
      if (allowance === null) continue;
      const used = toCount(
        await ledger.store.get(credentialSpendKey(promotion.promotionId, credential.id)),
      );
      if (used + promotion.turnReserveMicrousd <= allowance) return true;
    }
    return false;
  } catch (error) {
    logger.warn(
      { error, promotionId: promotion.promotionId },
      '[free-model-promotion] capacity could not be read',
    );
    return false;
  }
}

/**
 * Whether this account may still run provider searches on the promotion in
 * its rolling window. Unreadable reads as no: a search is money, and the turn
 * still answers without it.
 */
export async function freeModelPromotionSearchesLeft(
  promotion: Pick<FreeModelPromotion, 'promotionId' | 'perUserWebSearches'>,
  userId: string,
  nowMs: number = Date.now(),
  store: KeyValueStore | null = sharedKeyValueStore(process.env.NODE_ENV),
): Promise<boolean> {
  if (!store || promotion.perUserWebSearches.limit === 0) return false;
  const key = searchKey(promotion.promotionId, userId);
  try {
    await store.sortedRemoveByScore(key, 0, nowMs - promotion.perUserWebSearches.windowMs);
    return (await store.sortedSize(key)) < promotion.perUserWebSearches.limit;
  } catch (error) {
    logger.warn(
      { error, promotionId: promotion.promotionId },
      '[free-model-promotion] search allowance could not be read',
    );
    return false;
  }
}

export async function recordFreeModelPromotionSearches(
  input: { promotionId: string; userId: string; requestId: string; searches: number },
  windowMs: number = loadFreeModelPromotionConfig().perUserWebSearches.windowHours *
    MILLISECONDS_PER_HOUR,
  store: KeyValueStore | null = sharedKeyValueStore(process.env.NODE_ENV),
  nowMs: number = Date.now(),
): Promise<void> {
  const searches = Math.max(0, Math.trunc(input.searches));
  if (!store || searches === 0) return;
  const key = searchKey(input.promotionId, input.userId);
  try {
    for (let index = 0; index < searches; index += 1) {
      await store.sortedAdd(key, { score: nowMs, member: `${input.requestId}:${index}` });
    }
    await store.expire(key, Math.ceil(windowMs / 1_000) + KEY_RETENTION_SECONDS);
  } catch (error) {
    logger.warn(
      { error, promotionId: input.promotionId, searches },
      '[free-model-promotion] searches were not recorded',
    );
  }
}
