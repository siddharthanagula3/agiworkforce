import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import {
  getBillingPlanPricing,
  getPlanDailyChatFileUploadBytes,
  getPlanMaxConcurrentChatFileIntakes,
} from '@agiworkforce/types';
import { formatBytes } from '@agiworkforce/utils';

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';

export const DAILY_LARGE_FILE_BYTES_CODE = 'daily_large_file_bytes_reached';
export const LARGE_FILE_INTAKES_IN_FLIGHT_CODE = 'large_file_intakes_in_flight';
export const LARGE_FILE_COUNTER_UNAVAILABLE_CODE = 'large_file_counter_unavailable';

const DAILY_BYTES_PREFIX = 'agi:chat-files:daily-bytes:';
const SCAN_REFUNDS_PREFIX = 'agi:chat-files:scan-refunds:';
const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_DAY = SECONDS_PER_DAY * 1_000;

type QuotaStore = KeyValueStore | null;

function resolveStore(store: QuotaStore | undefined): QuotaStore {
  return store === undefined ? getKeyValueStore() : store;
}

function utcDay(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

function dailyBytesKey(userId: string, atMs: number): string {
  return `${DAILY_BYTES_PREFIX}${userId}:${utcDay(atMs)}`;
}

function dailyBytesRefusal(planTier: string, limitBytes: number): AppError {
  const label = getBillingPlanPricing(planTier).label;
  const message =
    limitBytes <= 0
      ? `${label} accounts can’t upload files this large. Upgrade to upload them.`
      : `${label} accounts can upload ${formatBytes(limitBytes, 1)} of large files a day, and today’s are used. Upload more after midnight UTC, or upgrade for more.`;
  return new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429, {
    code: DAILY_LARGE_FILE_BYTES_CODE,
  }).asUserSafe();
}

function counterUnavailableRefusal(): AppError {
  return new AppError(
    ErrorCode.SERVICE_UNAVAILABLE,
    'We couldn’t start this upload. Try again in a moment.',
    503,
    { code: LARGE_FILE_COUNTER_UNAVAILABLE_CODE },
  ).asUserSafe();
}

/**
 * Charged at create, before any byte is sent. A plan value of zero is a plan
 * with no large path, never an unlimited one, and a count that cannot be kept
 * refuses the upload rather than letting it through uncounted.
 */
export async function chargeDailyLargeFileBytes(input: {
  userId: string;
  planTier: string;
  byteCount: number;
  nowMs?: number;
  store?: QuotaStore;
}): Promise<number> {
  const limitBytes = getPlanDailyChatFileUploadBytes(input.planTier);
  if (!Number.isSafeInteger(input.byteCount) || input.byteCount <= 0) {
    throw new RangeError('A large file charge is a positive whole number of bytes.');
  }
  if (!(limitBytes > 0)) throw dailyBytesRefusal(input.planTier, limitBytes);
  const store = resolveStore(input.store);
  if (!store) throw counterUnavailableRefusal();
  const key = dailyBytesKey(input.userId, input.nowMs ?? Date.now());
  let total: number;
  try {
    total = await store.increment(key, input.byteCount);
  } catch (error) {
    logger.error({ error, userId: input.userId }, '[chat-files] the daily large file bytes failed');
    throw counterUnavailableRefusal();
  }
  try {
    await store.expire(key, 2 * SECONDS_PER_DAY);
  } catch (error) {
    logger.error({ error, userId: input.userId }, '[chat-files] the daily large file bytes failed');
    await store.increment(key, -input.byteCount).catch(() => undefined);
    throw counterUnavailableRefusal();
  }
  if (total > limitBytes) {
    await store.increment(key, -input.byteCount).catch(() => undefined);
    throw dailyBytesRefusal(input.planTier, limitBytes);
  }
  return input.byteCount;
}

/** Gives bytes back to the day they were charged on. A refund that fails is logged and not retried. */
export async function refundDailyLargeFileBytes(input: {
  userId: string;
  bytes: number;
  chargedAtMs: number;
  store?: QuotaStore;
}): Promise<boolean> {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) return false;
  const store = resolveStore(input.store);
  if (!store) {
    logger.warn({ userId: input.userId }, '[chat-files] a large file refund had no counter store');
    return false;
  }
  try {
    const key = dailyBytesKey(input.userId, input.chargedAtMs);
    await store.increment(key, -input.bytes);
    await store.expire(key, 2 * SECONDS_PER_DAY);
    return true;
  } catch (error) {
    logger.warn({ error, userId: input.userId }, '[chat-files] a large file refund failed');
    return false;
  }
}

/**
 * Whether a `scan_unavailable` ending may give its bytes back: at most
 * `intake.scanUnavailableRefundsPerDay` a person in any rolling 24 hours. Each
 * ending is recorded before the window is read, so two at once both see each
 * other and the earlier ones by time are the refunded ones; one that is not
 * refunded is taken out again, so the window holds only refunds.
 */
export async function admitScanUnavailableRefund(input: {
  userId: string;
  intakeId: string;
  nowMs: number;
  store?: QuotaStore;
}): Promise<boolean> {
  const cap = CHAT_LARGE_FILE_POLICY.intake.scanUnavailableRefundsPerDay;
  if (!(cap > 0)) return false;
  const store = resolveStore(input.store);
  if (!store) return false;
  const key = `${SCAN_REFUNDS_PREFIX}${input.userId}`;
  const windowStart = input.nowMs - MS_PER_DAY;
  try {
    const results = await store
      .batch()
      .sortedRemoveByScore(key, 0, windowStart)
      .sortedAdd(key, { score: input.nowMs, member: input.intakeId })
      .sortedRangeByScore(key, windowStart + 1, Number.MAX_SAFE_INTEGER)
      .expire(key, 2 * SECONDS_PER_DAY)
      .exec();
    const window = results[2];
    const position = Array.isArray(window) ? window.map(String).indexOf(input.intakeId) : -1;
    if (position >= 0 && position < cap) return true;
    await store.sortedRemove(key, input.intakeId);
    return false;
  } catch (error) {
    logger.warn(
      { error, userId: input.userId },
      '[chat-files] the refund window could not be read',
    );
    return false;
  }
}

function inFlightRefusal(planTier: string, limit: number): AppError {
  const label = getBillingPlanPricing(planTier).label;
  const message =
    limit <= 0
      ? `${label} accounts can’t upload files this large. Upgrade to upload them.`
      : `${label} accounts can upload ${limit} large ${limit === 1 ? 'file' : 'files'} at a time. Wait for one to finish, then try again.`;
  return new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429, {
    code: LARGE_FILE_INTAKES_IN_FLIGHT_CODE,
  }).asUserSafe();
}

/** `inFlight` is `countInFlightIntakes` from the intake store, asked by the caller. */
export function assertLargeFileIntakeSlot(input: { planTier: string; inFlight: number }): void {
  const limit = getPlanMaxConcurrentChatFileIntakes(input.planTier);
  if (!(limit > 0) || input.inFlight >= limit) throw inFlightRefusal(input.planTier, limit);
}
