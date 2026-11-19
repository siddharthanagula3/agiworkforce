// @vitest-environment node
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import { getPlanDailyChatFileUploadBytes } from '@agiworkforce/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type KeyValueModule = typeof import('@/lib/server/key-value');

vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: vi.fn(),
}));

import { CHAT_LARGE_FILE_POLICY } from '@/lib/chat-attachment-policy';
import { isAppError } from '@/lib/errors';
import { getKeyValueStore } from '@/lib/server/key-value';
import {
  admitScanUnavailableRefund,
  assertLargeFileIntakeSlot,
  chargeDailyLargeFileBytes,
  DAILY_LARGE_FILE_BYTES_CODE,
  LARGE_FILE_COUNTER_UNAVAILABLE_CODE,
  LARGE_FILE_INTAKES_IN_FLIGHT_CODE,
  refundDailyLargeFileBytes,
} from '../quotas';
import { START_MS } from './inline-executor';

const MIB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1_000;
const USER = 'user-owner';
const DAY_KEY = `agi:chat-files:daily-bytes:${USER}:2026-11-15`;

let kv: KeyValueStore;

beforeEach(() => {
  kv = createMemoryKeyValueStore({ now: () => START_MS });
  vi.mocked(getKeyValueStore).mockReturnValue(kv);
});

function refusalCode(error: unknown): unknown {
  return isAppError(error) ? (error.details as { code?: unknown } | undefined)?.code : undefined;
}

async function refusedWith(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(isAppError(error) && error.statusCode).toBe(429);
    return refusalCode(error);
  }
  throw new Error('The charge was not refused.');
}

async function unavailableWith(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    expect(isAppError(error) && error.statusCode).toBe(503);
    expect(isAppError(error) && error.message).toBe(
      'We couldn’t start this upload. Try again in a moment.',
    );
    return refusalCode(error);
  }
  throw new Error('The charge was not refused.');
}

describe('chargeDailyLargeFileBytes', () => {
  it('charges the UTC day and refuses the upload that would pass the plan’s bytes', async () => {
    const limit = getPlanDailyChatFileUploadBytes('basic');
    expect(limit).toBeGreaterThan(0);

    await chargeDailyLargeFileBytes({
      userId: USER,
      planTier: 'basic',
      byteCount: limit - MIB,
      nowMs: START_MS,
    });
    await expect(
      refusedWith(
        chargeDailyLargeFileBytes({
          userId: USER,
          planTier: 'basic',
          byteCount: 2 * MIB,
          nowMs: START_MS,
        }),
      ),
    ).resolves.toBe(DAILY_LARGE_FILE_BYTES_CODE);
    expect(await kv.get(DAY_KEY)).toBe(limit - MIB);
    await chargeDailyLargeFileBytes({
      userId: USER,
      planTier: 'basic',
      byteCount: MIB,
      nowMs: START_MS,
    });
    expect(await kv.get(DAY_KEY)).toBe(limit);
  });

  it.each(['free', 'no-such-plan'])(
    'refuses the %s plan, whose value of zero is no large path',
    async (plan) => {
      expect(getPlanDailyChatFileUploadBytes(plan)).toBe(0);
      await expect(
        refusedWith(chargeDailyLargeFileBytes({ userId: USER, planTier: plan, byteCount: MIB })),
      ).resolves.toBe(DAILY_LARGE_FILE_BYTES_CODE);
      expect(await kv.get(DAY_KEY)).toBeNull();
    },
  );

  it('refuses rather than lets an upload through uncounted, saying the counter is down', async () => {
    vi.mocked(getKeyValueStore).mockReturnValue(null);
    await expect(
      unavailableWith(chargeDailyLargeFileBytes({ userId: USER, planTier: 'pro', byteCount: MIB })),
    ).resolves.toBe(LARGE_FILE_COUNTER_UNAVAILABLE_CODE);

    const failing = createMemoryKeyValueStore();
    vi.spyOn(failing, 'expire').mockRejectedValue(new Error('down'));
    await expect(
      unavailableWith(
        chargeDailyLargeFileBytes({
          userId: USER,
          planTier: 'pro',
          byteCount: MIB,
          nowMs: START_MS,
          store: failing,
        }),
      ),
    ).resolves.toBe(LARGE_FILE_COUNTER_UNAVAILABLE_CODE);
    expect(await failing.get(DAY_KEY)).toBe(0);
  });

  it('takes nothing back when the charge itself failed', async () => {
    await kv.increment(DAY_KEY, 10 * MIB);
    const increment = vi.spyOn(kv, 'increment').mockRejectedValueOnce(new Error('down'));

    await expect(
      unavailableWith(
        chargeDailyLargeFileBytes({
          userId: USER,
          planTier: 'pro',
          byteCount: MIB,
          nowMs: START_MS,
        }),
      ),
    ).resolves.toBe(LARGE_FILE_COUNTER_UNAVAILABLE_CODE);
    expect(increment).toHaveBeenCalledTimes(1);
    expect(await kv.get(DAY_KEY)).toBe(10 * MIB);
  });

  it('names the plan’s daily bytes in GB', async () => {
    const limit = getPlanDailyChatFileUploadBytes('basic');
    await kv.increment(DAY_KEY, limit);
    let message = '';
    try {
      await chargeDailyLargeFileBytes({
        userId: USER,
        planTier: 'basic',
        byteCount: MIB,
        nowMs: START_MS,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain(`${limit / 1024 ** 3} GB of large files a day`);
    expect(message).not.toMatch(/\d MB/);
  });

  it('gives refunds back to the day they were charged on', async () => {
    await chargeDailyLargeFileBytes({
      userId: USER,
      planTier: 'pro',
      byteCount: 40 * MIB,
      nowMs: START_MS,
    });
    await expect(
      refundDailyLargeFileBytes({ userId: USER, bytes: 30 * MIB, chargedAtMs: START_MS }),
    ).resolves.toBe(true);
    expect(await kv.get(DAY_KEY)).toBe(10 * MIB);
    await expect(
      refundDailyLargeFileBytes({ userId: USER, bytes: 0, chargedAtMs: START_MS }),
    ).resolves.toBe(false);
  });
});

describe('assertLargeFileIntakeSlot', () => {
  it.each(['free', 'no-such-plan'])('refuses the %s plan at any count', (plan) => {
    let code: unknown;
    try {
      assertLargeFileIntakeSlot({ planTier: plan, inFlight: 0 });
    } catch (error) {
      code = refusalCode(error);
    }
    expect(code).toBe(LARGE_FILE_INTAKES_IN_FLIGHT_CODE);
  });

  it('admits under the plan’s count and refuses at it', () => {
    expect(() => assertLargeFileIntakeSlot({ planTier: 'pro', inFlight: 2 })).not.toThrow();
    expect(() => assertLargeFileIntakeSlot({ planTier: 'pro', inFlight: 3 })).toThrow();
  });
});

describe('admitScanUnavailableRefund', () => {
  it('refunds the first three scan_unavailable endings in 24 hours, not the fourth, and again a day later', async () => {
    const cap = CHAT_LARGE_FILE_POLICY.intake.scanUnavailableRefundsPerDay;
    expect(cap).toBe(3);
    const admitted: boolean[] = [];
    for (let index = 0; index < cap + 1; index += 1) {
      admitted.push(
        await admitScanUnavailableRefund({
          userId: USER,
          intakeId: `intake-${index}`,
          nowMs: START_MS + index * 60_000,
        }),
      );
    }
    expect(admitted).toEqual([true, true, true, false]);

    await expect(
      admitScanUnavailableRefund({
        userId: USER,
        intakeId: 'intake-next-day',
        nowMs: START_MS + DAY_MS + 60_000,
      }),
    ).resolves.toBe(true);
  });

  it('counts only refunded endings, so a refused one does not hold a later refund back', async () => {
    const hour = 60 * 60_000;
    const admitted: boolean[] = [];
    for (const [index, offset] of [0, hour, 2 * hour, 3 * hour, DAY_MS + 30 * 60_000].entries()) {
      admitted.push(
        await admitScanUnavailableRefund({
          userId: USER,
          intakeId: `intake-${index}`,
          nowMs: START_MS + offset,
        }),
      );
    }

    expect(admitted).toEqual([true, true, true, false, true]);
  });

  it('refunds nothing when the window cannot be read', async () => {
    vi.mocked(getKeyValueStore).mockReturnValue(null);
    await expect(
      admitScanUnavailableRefund({ userId: USER, intakeId: 'intake-0', nowMs: START_MS }),
    ).resolves.toBe(false);
  });
});
