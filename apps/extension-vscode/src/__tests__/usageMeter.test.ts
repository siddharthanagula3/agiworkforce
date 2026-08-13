import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { fetchTierInfo } from '../utils/api';
import {
  formatManagedUsageLabel,
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
    inspect: vi.fn().mockReturnValue(undefined),
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

  // The managed billing contract is percentage-only: TierInfoSchema never
  // returns exact token/cent counts, so buildManagedMeter derives `remaining`
  // as a 0-1 fraction from usagePercentage and never emits usedTokens/limitTokens
  // (the exact token/cap client fields were intentionally dropped — see
  // known-flaws.md VS Code usage rewire).
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

  it('formats labels with reported token counts when provided', () => {
    expect(formatManagedUsageLabel(0.75, 100_000, 25_000)).toBe('25.0k/100.0k tokens');
  });

  it('formats fallback labels from the canonical trust mode vocabulary', () => {
    expect(formatUsageMeterFallbackLabel('unbounded')).toBe('Local model - no quota tracking');
    expect(formatUsageMeterFallbackLabel('user-api-key')).toBe(
      'BYOK mode - no AGI-managed quota is active',
    );
    expect(formatUsageMeterFallbackLabel('managed-plan')).toBe('Managed usage unavailable');
  });
});
