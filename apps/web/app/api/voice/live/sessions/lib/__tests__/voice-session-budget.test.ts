import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoutingSlotModel, MICROUSD_PER_CREDIT } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/rolling-usage');
type ScanModule1 = typeof import('@/lib/server/spendable-credits');
type ScanModule2 = typeof import('@/lib/services/credit-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  rollingUsage: vi.fn(),
  balance: vi.fn(),
  spendable: vi.fn(),
}));

vi.mock('@/lib/server/rolling-usage', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getRollingUsage: (...args: unknown[]) => mocks.rollingUsage(...args),
}));
vi.mock('@/lib/server/spendable-credits', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getSpendableCredits: (...args: unknown[]) => mocks.spendable(...args),
}));
vi.mock('@/lib/services/credit-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule2>();
  return {
    ...actual,
    CreditService: {
      ...actual.CreditService,
      getBalance: (...args: unknown[]) => mocks.balance(...args),
    },
  };
});

import {
  getPlanSessionUsageCapMicrousd,
  getPlanWeeklyUsageCapMicrousd,
} from '@/lib/server/managed-usage-policy';
import {
  LIVE_SESSION_CEILING_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionSecondsCoveredBy,
} from '@/lib/voice/live-voice-billing';

import { planVoiceSessionBlock, readVoiceReservation } from '../voice-session-budget';

const LIVE_MODEL = getRoutingSlotModel('voice_live');
const FULL_BLOCK_MICROUSD = liveSessionChargeMicrousd(
  LIVE_SESSION_CEILING_SECONDS,
  LIVE_MODEL,
) as number;
const FIVE_HOUR_OLDEST = '2026-09-27T10:00:00.000Z';
const WEEKLY_OLDEST = '2026-09-24T10:00:00.000Z';
const PERIOD_END = '2026-10-15T00:00:00.000Z';
const db = { query: vi.fn() } as never;

function capsFor(tier: string): { session: number; weekly: number } {
  const allowance = { tier, catalogVersion: null };
  return {
    session: getPlanSessionUsageCapMicrousd(allowance) as number,
    weekly: getPlanWeeklyUsageCapMicrousd(allowance) as number,
  };
}

function usage(input: { session: number; weekly: number }): void {
  mocks.rollingUsage.mockImplementation(async (_db: unknown, _user: string, hours: number) =>
    hours === 5
      ? { usedMicrousd: input.session, oldestAt: FIVE_HOUR_OLDEST }
      : { usedMicrousd: input.weekly, oldestAt: WEEKLY_OLDEST },
  );
}

function monthly(remainingMicrousd: number | null, dailyRemainingMicrousd?: number | null): void {
  mocks.balance.mockResolvedValue(
    remainingMicrousd === null
      ? null
      : {
          credits_remaining_microusd: remainingMicrousd,
          daily_remaining_microusd: dailyRemainingMicrousd ?? null,
          period_end: PERIOD_END,
        },
  );
}

function plan(tier: string) {
  return planVoiceSessionBlock({
    db,
    userId: 'user-1',
    planTier: tier,
    catalogVersion: null,
    modelId: LIVE_MODEL,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  usage({ session: 0, weekly: 0 });
  monthly(1_000_000_000);
  mocks.spendable.mockResolvedValue({
    availableMicrousd: 0,
    availableCents: 0,
    overageEnabled: false,
  });
});

describe('planVoiceSessionBlock', () => {
  it('holds a Pro session to what its five-hour window covers', async () => {
    const caps = capsFor('pro');
    expect(caps.session).toBe(50 * MICROUSD_PER_CREDIT);
    expect(caps.session).toBeLessThan(FULL_BLOCK_MICROUSD);

    const block = await plan('pro');

    expect(block.blockSeconds).toBe(liveSessionSecondsCoveredBy(caps.session, LIVE_MODEL));
    expect(block.blockSeconds).toBeLessThan(LIVE_SESSION_CEILING_SECONDS);
  });

  it('gives a whole block when every window has room for it', async () => {
    const caps = capsFor('max_15x');
    expect(caps.session).toBeGreaterThan(FULL_BLOCK_MICROUSD);

    const block = await plan('max_15x');

    expect(block.blockSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
  });

  it('sizes the block to the smallest remaining window', async () => {
    const caps = capsFor('max_15x');
    const sessionLeft = 120_000;
    usage({ session: caps.session - sessionLeft, weekly: 0 });
    expect((await plan('max_15x')).blockSeconds).toBe(
      liveSessionSecondsCoveredBy(sessionLeft, LIVE_MODEL),
    );

    const weeklyLeft = 90_000;
    usage({ session: 0, weekly: caps.weekly - weeklyLeft });
    expect((await plan('max_15x')).blockSeconds).toBe(
      liveSessionSecondsCoveredBy(weeklyLeft, LIVE_MODEL),
    );

    usage({ session: 0, weekly: 0 });
    monthly(60_000);
    expect((await plan('max_15x')).blockSeconds).toBe(
      liveSessionSecondsCoveredBy(60_000, LIVE_MODEL),
    );

    monthly(1_000_000_000, 30_000);
    expect((await plan('max_15x')).blockSeconds).toBe(
      liveSessionSecondsCoveredBy(30_000, LIVE_MODEL),
    );
  });

  it('gives no block when nothing is left and overage is off', async () => {
    const caps = capsFor('pro');
    usage({ session: caps.session, weekly: 0 });

    expect((await plan('pro')).blockSeconds).toBe(0);

    usage({ session: 0, weekly: 0 });
    monthly(null);
    expect((await plan('pro')).blockSeconds).toBe(0);
  });

  it('draws on purchased credits only when overage is enabled', async () => {
    const caps = capsFor('pro');
    usage({ session: caps.session, weekly: 0 });
    mocks.spendable.mockResolvedValue({
      availableMicrousd: 80_000,
      availableCents: 8,
      overageEnabled: false,
    });
    expect((await plan('pro')).blockSeconds).toBe(0);

    mocks.spendable.mockResolvedValue({
      availableMicrousd: 80_000,
      availableCents: 8,
      overageEnabled: true,
    });
    expect((await plan('pro')).blockSeconds).toBe(liveSessionSecondsCoveredBy(80_000, LIVE_MODEL));
  });

  it('never sizes a block past the ceiling, whatever overage is available', async () => {
    const caps = capsFor('pro');
    usage({ session: caps.session, weekly: 0 });
    mocks.spendable.mockResolvedValue({
      availableMicrousd: 100 * FULL_BLOCK_MICROUSD,
      availableCents: 0,
      overageEnabled: true,
    });

    expect((await plan('pro')).blockSeconds).toBe(LIVE_SESSION_CEILING_SECONDS);
  });

  it('names when each limit that could refuse the block resets', async () => {
    const block = await plan('pro');

    expect(block.resetsAt).toEqual({
      rolling_five_hour_limit_reached: '2026-09-27T15:00:00.000Z',
      rolling_weekly_limit_reached: '2026-10-01T10:00:00.000Z',
      insufficient_credits: PERIOD_END,
    });
    expect(mocks.rollingUsage).toHaveBeenCalledWith(db, 'user-1', 5, false);
    expect(mocks.rollingUsage).toHaveBeenCalledWith(db, 'user-1', 7 * 24, false);
  });
});

describe('readVoiceReservation', () => {
  function reservationDb(rows: Array<Record<string, unknown>>) {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => rows);
    return { db: { query } as never, query };
  }

  it('reads the reserved amount and the block extension from the ledger', async () => {
    const { db: ledger, query } = reservationDb([
      { reserved_microusd: '500000', extension_status: 'extended', extension_microusd: '250000.7' },
    ]);

    await expect(
      readVoiceReservation({
        db: ledger,
        userId: 'user-1',
        idempotencyKey: 'agi.voice.live.test',
        requestHash: 'hash',
        operationKey: 'provider:2',
      }),
    ).resolves.toEqual({
      reservedMicrousd: 500_000,
      extensionStatus: 'extended',
      extensionMicrousd: 250_000,
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from public.managed_usage_requests request');
    expect(sql).toContain('extension.operation_key = $4');
    expect(params).toEqual(['user-1', 'agi.voice.live.test', 'hash', 'provider:2']);
  });

  it('asks for no extension when no block is named', async () => {
    const { db: ledger, query } = reservationDb([
      { reserved_microusd: 500_000, extension_status: null, extension_microusd: null },
    ]);

    await expect(
      readVoiceReservation({
        db: ledger,
        userId: 'user-1',
        idempotencyKey: 'agi.voice.live.test',
        requestHash: 'hash',
      }),
    ).resolves.toEqual({
      reservedMicrousd: 500_000,
      extensionStatus: null,
      extensionMicrousd: null,
    });
    expect((query.mock.calls[0] as [string, unknown[]])[1][3]).toBe('');
  });

  it('reports no reservation for a missing row or an unreadable amount', async () => {
    for (const rows of [
      [],
      [{ reserved_microusd: null, extension_status: null, extension_microusd: null }],
      [{ reserved_microusd: '-5', extension_status: null, extension_microusd: null }],
      [{ reserved_microusd: 'not-a-number', extension_status: null, extension_microusd: null }],
    ]) {
      await expect(
        readVoiceReservation({
          db: reservationDb(rows).db,
          userId: 'user-1',
          idempotencyKey: 'agi.voice.live.test',
          requestHash: 'hash',
        }),
      ).resolves.toBeNull();
    }
  });
});
