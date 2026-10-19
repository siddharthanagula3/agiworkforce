import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getPlanUsageBudgetMicrousd } from '@/lib/server/managed-usage-policy';
import { USAGE_CREDITS_NOTICE, resolveUsageCreditsNotice } from './usage-credits-notice';

const PLAN = 'max_15x';
const BUDGET = getPlanUsageBudgetMicrousd(PLAN);

function ledger(prepaidMicrousd: number) {
  return {
    query: vi.fn(async () => [{ prepaid_microusd: prepaidMicrousd }]),
  } as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

describe('usage credits notice', () => {
  it('names a turn the reservation had to cover with usage credits', async () => {
    const db = ledger(0);
    await expect(
      resolveUsageCreditsNotice({
        db,
        userId: 'user_1',
        plan: PLAN,
        reservationFundedByCredits: true,
        creditsUsedMicrousd: 0,
        creditsRemainingMicrousd: BUDGET,
        estimatedCostMicrousd: 1_000,
      }),
    ).resolves.toBe(USAGE_CREDITS_NOTICE);
  });

  it('names a turn that runs past the monthly allowance into purchased credits', async () => {
    const purchased = 5_000_000;
    await expect(
      resolveUsageCreditsNotice({
        db: ledger(purchased),
        userId: 'user_1',
        plan: PLAN,
        reservationFundedByCredits: false,
        creditsUsedMicrousd: BUDGET - 500,
        creditsRemainingMicrousd: purchased + 500,
        estimatedCostMicrousd: 1_000,
      }),
    ).resolves.toBe(USAGE_CREDITS_NOTICE);
  });

  it('says nothing past the catalog allowance when no prepaid credits are held', async () => {
    await expect(
      resolveUsageCreditsNotice({
        db: ledger(0),
        userId: 'user_1',
        plan: PLAN,
        reservationFundedByCredits: false,
        creditsUsedMicrousd: BUDGET - 500,
        creditsRemainingMicrousd: BUDGET,
        estimatedCostMicrousd: 1_000,
      }),
    ).resolves.toBeNull();
  });

  it('reads nothing while the plan still covers the turn', async () => {
    const db = ledger(5_000_000);
    await expect(
      resolveUsageCreditsNotice({
        db,
        userId: 'user_1',
        plan: PLAN,
        reservationFundedByCredits: false,
        creditsUsedMicrousd: 1_000,
        creditsRemainingMicrousd: BUDGET + 5_000_000,
        estimatedCostMicrousd: 1_000,
      }),
    ).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});
