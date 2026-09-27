import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { fetchTierInfo } from '../utils/api';
import {
  formatBucketCreditsLeft,
  formatUsageMeterFallbackLabel,
  resolvePlanTier,
  resolveUsageMeter,
} from '../data/usageMeter';

vi.mock('../utils/api', () => ({
  fetchTierInfo: vi.fn(),
}));

function setConfiguredModel(model: string): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(<T>(key: string, defaultValue?: T): T | string | undefined =>
      key === 'model' ? model : defaultValue,
    ),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn((key: string) => (key === 'model' ? { key, globalValue: model } : undefined)),
  });
}

describe('usageMeter', () => {
  const secrets = {} as vscode.SecretStorage;

  beforeEach(() => {
    vi.mocked(fetchTierInfo).mockReset();
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    setConfiguredModel('fixture-cloud-model');
  });

  it('treats local models as unbounded without fetching cloud usage', async () => {
    setConfiguredModel('ollama/fixture-local-model');

    await expect(resolvePlanTier(secrets)).resolves.toBe('local');
    await expect(resolveUsageMeter(secrets, 1_200)).resolves.toEqual({
      remaining: null,
      resetsAt: null,
      source: 'unbounded',
    });
    expect(fetchTierInfo).not.toHaveBeenCalled();
  });

  it('derives a remaining fraction from the percentage-only usage contract', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'max',
      usagePercentage: 25,
      resetsAt: '2026-06-01T00:00:00.000Z',
    });

    await expect(resolvePlanTier(secrets)).resolves.toBe('max');
    await expect(resolveUsageMeter(secrets, 999)).resolves.toEqual({
      remaining: 0.75,
      resetsAt: '2026-06-01T00:00:00.000Z',
      source: 'managed-plan',
      accountPlanTier: 'max',
      managedDeveloperEligible: true,
    });
  });

  it('keeps Basic on Local or BYOK without inventing Managed Cloud quota', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'basic',
      resetsAt: '2026-06-01T00:00:00.000Z',
    });

    await expect(resolveUsageMeter(secrets, 6_200)).resolves.toEqual({
      remaining: null,
      resetsAt: '2026-06-01T00:00:00.000Z',
      source: 'user-api-key',
      accountPlanTier: 'basic',
      managedDeveloperEligible: false,
    });
  });

  it.each(['max_15x', 'team', 'enterprise'] as const)(
    'preserves the canonical %s plan returned by account usage',
    async (tier) => {
      vi.mocked(fetchTierInfo).mockResolvedValue({
        tier,
        usagePercentage: 10,
        resetsAt: '2026-06-01T00:00:00.000Z',
      });

      await expect(resolvePlanTier(secrets)).resolves.toBe(tier);
      await expect(resolveUsageMeter(secrets, 100)).resolves.toEqual({
        remaining: 0.9,
        resetsAt: '2026-06-01T00:00:00.000Z',
        source: 'managed-plan',
        accountPlanTier: tier,
        managedDeveloperEligible: true,
      });
    },
  );

  it('shows a recorded paid plan as needing billing attention when entitlement is paused', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'free',
      accountPlanTier: 'pro',
      subscriptionStatus: 'past_due',
    });

    await expect(resolveUsageMeter(secrets, 100)).resolves.toEqual({
      remaining: null,
      resetsAt: null,
      source: 'user-api-key',
      accountPlanTier: 'pro',
      managedDeveloperEligible: false,
      subscriptionStatus: 'past_due',
    });
  });

  it('falls back to not-AGI-managed usage when no cloud tier is available', async () => {
    await expect(resolvePlanTier(secrets)).resolves.toBe('byok');
    await expect(resolveUsageMeter(secrets, 6_200)).resolves.toEqual({
      remaining: null,
      resetsAt: null,
      source: 'user-api-key',
    });
  });

  it('states what is left of a window in credits, never in tokens', () => {
    expect(
      formatBucketCreditsLeft({
        bucket: 'session',
        percentRemaining: 25,
        resetAt: null,
        allowanceCredits: 50,
        usedCredits: 37.5,
      }),
    ).toBe('12.5 of 50 credits left');
    expect(
      formatBucketCreditsLeft({
        bucket: 'period',
        percentRemaining: 60,
        resetAt: null,
        allowanceCredits: 2_000,
        usedCredits: 800,
      }),
    ).toBe('1,200 of 2,000 credits left');
  });

  it('never states a negative balance once usage passes the allowance', () => {
    expect(
      formatBucketCreditsLeft({
        bucket: 'weekly',
        percentRemaining: 0,
        resetAt: null,
        allowanceCredits: 500,
        usedCredits: 540,
      }),
    ).toBe('0 of 500 credits left');
  });

  it('claims no credit figure when the server published none for the window', () => {
    expect(
      formatBucketCreditsLeft({ bucket: 'session', percentRemaining: 40, resetAt: null }),
    ).toBeNull();
    expect(
      formatBucketCreditsLeft({
        bucket: 'weeklyFlagship',
        percentRemaining: 100,
        resetAt: null,
        allowanceCredits: 0,
        usedCredits: 0,
      }),
    ).toBeNull();
  });

  it('carries the credit windows from account usage onto a managed meter', async () => {
    const credits = {
      monthly: { allowance: 2_000, used: 800, remaining: 1_200, reset_at: null },
      weekly: { allowance: 500, used: 125, remaining: 375, reset_at: null },
      five_hour: { allowance: 50, used: 10, remaining: 40, reset_at: null },
      flagship_weekly: null,
      purchased: { remaining: 250, overage_enabled: true },
    };
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'pro',
      usagePercentage: 40,
      resetsAt: '2026-06-01T00:00:00.000Z',
      creditBalanceCents: 125,
      overageEnabled: true,
      credits,
    });

    await expect(resolveUsageMeter(secrets, 0)).resolves.toMatchObject({
      source: 'managed-plan',
      credits,
      creditBalanceCents: 125,
      overageEnabled: true,
    });
  });

  it('formats fallback labels from the canonical trust mode vocabulary', () => {
    expect(formatUsageMeterFallbackLabel('unbounded')).toBe('Local model - no quota tracking');
    expect(formatUsageMeterFallbackLabel('user-api-key')).toBe(
      'BYOK mode - no AGI-managed quota is active',
    );
    expect(formatUsageMeterFallbackLabel('managed-plan')).toBe('Managed Cloud usage unavailable');
  });
});
