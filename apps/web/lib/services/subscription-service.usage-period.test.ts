import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOrCreateAccount = vi.fn();
const mockResetForPeriod = vi.fn();
const mockCarryUsageIntoUpgradedPeriod = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(),
}));

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn(),
}));

const scopedDb = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() } as never;

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./credit-service', () => ({
  CreditService: {
    getOrCreateAccount: (...args: unknown[]) => mockGetOrCreateAccount(...args),
    resetForPeriod: (...args: unknown[]) => mockResetForPeriod(...args),
    carryUsageIntoUpgradedPeriod: (...args: unknown[]) => mockCarryUsageIntoUpgradedPeriod(...args),
  },
}));

import { SubscriptionService } from './subscription-service';

describe('SubscriptionService managed usage periods', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T00:00:00.000Z'));
    mockGetOrCreateAccount.mockReset().mockResolvedValue('account-id');
    mockResetForPeriod.mockReset().mockResolvedValue('account-id');
    mockCarryUsageIntoUpgradedPeriod.mockReset().mockResolvedValue('account-id');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allocates only the current monthly allowance window for annual billing', async () => {
    await SubscriptionService.allocateCreditsForPeriod(
      'user-1',
      'subscription-1',
      'pro',
      new Date('2026-01-18T12:00:00.000Z'),
      new Date('2027-01-18T12:00:00.000Z'),
      { db: scopedDb },
    );

    expect(mockGetOrCreateAccount).toHaveBeenCalledWith(
      'user-1',
      'subscription-1',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      1_000,
      scopedDb,
    );
  });

  it('resets only the current monthly allowance window for annual billing', async () => {
    await SubscriptionService.resetCreditsForNewPeriod(
      'user-1',
      'subscription-1',
      'pro',
      new Date('2026-01-18T12:00:00.000Z'),
      new Date('2027-01-18T12:00:00.000Z'),
      { db: scopedDb },
    );

    expect(mockResetForPeriod).toHaveBeenCalledWith(
      'user-1',
      'subscription-1',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      1_000,
      scopedDb,
    );
  });

  it('carries upgrade usage into the current monthly target window', async () => {
    await SubscriptionService.carryCreditsForUpgradePeriod(
      'user-1',
      'subscription-1',
      'pro',
      'max',
      new Date('2026-01-18T12:00:00.000Z'),
      new Date('2027-01-18T12:00:00.000Z'),
      scopedDb,
    );

    expect(mockCarryUsageIntoUpgradedPeriod).toHaveBeenCalledWith(
      'user-1',
      'subscription-1',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      4_000,
      scopedDb,
    );
  });
});
