import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/rolling-usage');
type ScanModule1 = typeof import('@/lib/server/spendable-credits');
type ScanModule2 = typeof import('@/lib/services/credit-service');
type ScanModule3 = typeof import('@/lib/server/managed-usage-policy');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  rollingUsage: vi.fn(),
  balance: vi.fn(),
  spendable: vi.fn(),
  sessionCap: vi.fn(),
  weeklyCap: vi.fn(),
  monthlyBudget: vi.fn(),
}));

vi.mock('@/lib/server/managed-usage-policy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getPlanSessionUsageCapMicrousd: mocks.sessionCap,
  getPlanWeeklyUsageCapMicrousd: mocks.weeklyCap,
  getPlanUsageBudgetMicrousd: mocks.monthlyBudget,
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
  getPlanUsageBudgetMicrousd,
  getPlanWeeklyUsageCapMicrousd,
} from '@/lib/server/managed-usage-policy';

import {
  assessVoiceBudget,
  readVoiceReservation,
  voiceReservationIdentity,
} from '../voice-session-budget';

const FIVE_HOUR_OLDEST = '2026-09-27T10:00:00.000Z';
const WEEKLY_OLDEST = '2026-09-24T10:00:00.000Z';
const PERIOD_END = '2026-10-15T00:00:00.000Z';
const BLOCK = 60_000;
const db = { query: vi.fn() } as never;

/**
 * Fixture budgets, not the plan table: the per-tier numbers wait on the
 * owner's unit economics, so these only exercise the mechanism.
 */
const FIXTURE_BUDGETS: Record<string, { session: number; weekly: number; monthly: number }> = {
  free: { session: 300_000, weekly: 1_000_000, monthly: 2_000_000 },
  pro: { session: 5_000_000, weekly: 25_000_000, monthly: 100_000_000 },
};

function fixtureCaps(): void {
  mocks.sessionCap.mockImplementation(({ tier }: { tier: string }) =>
    tier === 'max' ? null : (FIXTURE_BUDGETS[tier]?.session ?? 0),
  );
  mocks.weeklyCap.mockImplementation(({ tier }: { tier: string }) =>
    tier === 'max' ? null : (FIXTURE_BUDGETS[tier]?.weekly ?? 0),
  );
  mocks.monthlyBudget.mockImplementation(({ tier }: { tier: string }) =>
    tier === 'max' ? 1_000_000_000_000 : (FIXTURE_BUDGETS[tier]?.monthly ?? 0),
  );
}

function assess(tier: string) {
  return assessVoiceBudget({
    db,
    userId: 'user-1',
    planTier: tier,
    catalogVersion: null,
    blockMicrousd: BLOCK,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtureCaps();
  mocks.rollingUsage.mockImplementation(async (_db: unknown, _user: string, hours: number) =>
    hours === 5
      ? { usedMicrousd: 0, oldestAt: FIVE_HOUR_OLDEST }
      : { usedMicrousd: 0, oldestAt: WEEKLY_OLDEST },
  );
  mocks.balance.mockResolvedValue({
    credits_remaining_microusd: 1_000_000,
    daily_remaining_microusd: null,
    period_end: PERIOD_END,
  });
  mocks.spendable.mockResolvedValue({
    availableMicrousd: 0,
    availableCents: 0,
    overageEnabled: false,
  });
});

describe('assessVoiceBudget', () => {
  it('lets a plan with a nonzero budget fund a block, Free included', async () => {
    expect((await assess('free')).planFundsBlock).toBe(true);
    expect((await assess('pro')).planFundsBlock).toBe(true);
    expect((await assess('max')).planFundsBlock).toBe(true);
    expect(getPlanSessionUsageCapMicrousd).toBe(mocks.sessionCap);
    expect(getPlanWeeklyUsageCapMicrousd).toBe(mocks.weeklyCap);
    expect(getPlanUsageBudgetMicrousd).toBe(mocks.monthlyBudget);
  });

  it('reports that a plan with no budget cannot fund a block, unless overage covers it', async () => {
    expect((await assess('team_premium')).planFundsBlock).toBe(false);
    mocks.spendable.mockResolvedValue({
      availableMicrousd: BLOCK,
      availableCents: 6,
      overageEnabled: true,
    });
    expect((await assess('team_premium')).planFundsBlock).toBe(true);
  });

  it('names when each window that could refuse the next block resets', async () => {
    expect((await assess('pro')).resetsAt).toEqual({
      rolling_five_hour_limit_reached: '2026-09-27T15:00:00.000Z',
      rolling_weekly_limit_reached: '2026-10-01T10:00:00.000Z',
      insufficient_credits: PERIOD_END,
    });
  });
});

describe('voiceReservationIdentity', () => {
  it('names a session reservation by its record so anything holding the record can settle it', () => {
    const identity = voiceReservationIdentity('11111111-2222-4333-8444-555555555555');

    expect(identity.idempotencyKey).toBe('agi.voice.live.11111111-2222-4333-8444-555555555555');
    expect(identity.leaseToken).toBe('11111111-2222-4333-8444-555555555555');
    expect(identity.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(voiceReservationIdentity('11111111-2222-4333-8444-555555555555')).toEqual(identity);
    expect(voiceReservationIdentity('other').requestHash).not.toBe(identity.requestHash);
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
