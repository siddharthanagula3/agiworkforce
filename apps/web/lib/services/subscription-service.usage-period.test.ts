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

const scopedQuery = vi.fn();
const scopedDb = { query: scopedQuery, execute: vi.fn(), transaction: vi.fn() } as never;

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
    scopedQuery.mockReset().mockResolvedValue([{ plan_catalog_version: 1 }]);
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
      1,
    );
    expect(scopedQuery).toHaveBeenCalledWith(
      'select plan_catalog_version from subscriptions where id = $1 and user_id = $2 limit 1',
      ['subscription-1', 'user-1'],
    );
  });

  it('keeps a subscriber on the catalog version the caller already knows without reading it', async () => {
    await SubscriptionService.allocateCreditsForPeriod(
      'user-1',
      'subscription-1',
      'pro',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      { db: scopedDb, catalogVersion: 1 },
    );

    expect(scopedQuery).not.toHaveBeenCalled();
    expect(mockGetOrCreateAccount).toHaveBeenCalledWith(
      'user-1',
      'subscription-1',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      1_000,
      scopedDb,
      1,
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
      1,
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
      { previous: 1, next: 1 },
    );

    expect(mockCarryUsageIntoUpgradedPeriod).toHaveBeenCalledWith(
      'user-1',
      'subscription-1',
      new Date('2026-07-18T12:00:00.000Z'),
      new Date('2026-08-18T12:00:00.000Z'),
      4_000,
      scopedDb,
      1,
    );
  });
});
