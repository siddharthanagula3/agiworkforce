import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  grantReferralResetsToReferrer: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  logger: { debug: vi.fn(), error: mocks.loggerError, info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  getIdentityUser: vi.fn(),
}));
type BonusCreditModule = typeof import('@/lib/services/bonus-credit-service');

vi.mock('@/lib/services/bonus-credit-service', async (importOriginal) => ({
  ...(await importOriginal<BonusCreditModule>()),
  getPrepaidCreditBalances: vi.fn(),
  grantBonusCredits: vi.fn(),
  revokeBonusCreditGrant: vi.fn(),
}));
vi.mock('@/lib/services/notification-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  recordNotification: vi.fn(),
}));
vi.mock('@/lib/services/usage-limit-promotion-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  grantReferralResetsToReferrer: mocks.grantReferralResetsToReferrer,
}));

const { grantDueReferralRewards } = await import('./referral-service');

interface PendingScenario {
  pendingIds: string[];
  lockedReferral: { referrer_id: string; reward_issued_at: string } | null;
}

function fakeDb(scenario: PendingScenario) {
  const calls: { sql: string; params: unknown[]; inTransaction: boolean }[] = [];
  const build = (inTransaction: boolean): DatabaseAdapter => {
    const adapter = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params, inTransaction });
        if (sql.includes("status = 'converted'")) return [];
        if (sql.includes("referral.status = 'rewarded'")) {
          return scenario.pendingIds.map((id) => ({ id }));
        }
        if (sql.includes('for update')) {
          return scenario.lockedReferral ? [scenario.lockedReferral] : [];
        }
        return [];
      }),
      execute: vi.fn(async () => 0),
      transaction: vi.fn(async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(build(true))),
    };
    return adapter as unknown as DatabaseAdapter;
  };
  return { db: build(false), calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.grantReferralResetsToReferrer.mockResolvedValue(1);
});

describe('referral reset custody', () => {
  it('retries a rewarded referral whose reset grant failed on the previous sweep', async () => {
    const { db } = fakeDb({
      pendingIds: ['ref-1'],
      lockedReferral: { referrer_id: 'user-1', reward_issued_at: '2026-11-01T00:00:00.000Z' },
    });
    mocks.grantReferralResetsToReferrer.mockRejectedValueOnce(new Error('connection reset'));

    const first = await grantDueReferralRewards(db, 50);
    const second = await grantDueReferralRewards(db, 50);

    expect(first.resetsFailed).toBe(1);
    expect(first.failed).toBe(0);
    expect(second.resetsFailed).toBe(0);
    expect(mocks.grantReferralResetsToReferrer).toHaveBeenCalledTimes(2);
  });

  it('issues the resets under the referral row lock and judges promotions at the reward time', async () => {
    const { db, calls } = fakeDb({
      pendingIds: ['ref-1'],
      lockedReferral: { referrer_id: 'user-1', reward_issued_at: '2026-11-01T00:00:00.000Z' },
    });

    await grantDueReferralRewards(db, 50);

    const lock = calls.find((call) => call.sql.includes('for update'));
    expect(lock?.inTransaction).toBe(true);
    expect(lock?.sql).toContain("status = 'rewarded'");
    expect(lock?.sql).toContain('clawed_back_at is null');
    const [adapter, input] = mocks.grantReferralResetsToReferrer.mock.calls[0] ?? [];
    expect(adapter).not.toBe(db);
    expect(input).toEqual({
      referrerId: 'user-1',
      referralId: 'ref-1',
      eligibleAtMs: Date.parse('2026-11-01T00:00:00.000Z'),
    });
  });

  it('grants nothing when the referral was clawed back before the lock was taken', async () => {
    const { db } = fakeDb({ pendingIds: ['ref-1'], lockedReferral: null });

    const summary = await grantDueReferralRewards(db, 50);

    expect(mocks.grantReferralResetsToReferrer).not.toHaveBeenCalled();
    expect(summary.resetsFailed).toBe(0);
  });

  it('only replays rewarded referrals inside the replay window that hold no reset yet', async () => {
    const { db, calls } = fakeDb({ pendingIds: [], lockedReferral: null });

    await grantDueReferralRewards(db, 50);

    const replay = calls.find((call) => call.sql.includes("referral.status = 'rewarded'"));
    expect(replay?.sql).toContain('referral.clawed_back_at is null');
    expect(replay?.sql).toContain('not exists');
    expect(replay?.sql).toContain('usage_limit_promotion_grants');
    expect(replay?.params).toEqual([50, 7]);
  });
});

type ImportedModule3 = typeof import('@/lib/logger');
type ImportedModule2 = typeof import('@/lib/server/identity');
type ImportedModule1 = typeof import('@/lib/services/notification-service');
type ImportedModule0 = typeof import('@/lib/services/usage-limit-promotion-service');
