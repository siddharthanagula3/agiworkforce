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
    setConfiguredModel('claude-sonnet-4.6');
  });

  it('treats local models as unbounded without fetching cloud usage', async () => {
    setConfiguredModel('ollama/llama3.2');

    await expect(resolvePlanTier(secrets)).resolves.toBe('local');
    await expect(resolveUsageMeter(secrets, 1_200)).resolves.toEqual({
      remaining: null,
      resetsAt: null,
      source: 'unbounded',
    });
    expect(fetchTierInfo).not.toHaveBeenCalled();
  });

  it('uses reported managed quota fields instead of stubbed quota values', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'pro_plus',
      tokensUsed: 25_000,
      tokenCap: 100_000,
      resetsAt: '2026-06-01T00:00:00.000Z',
    });

    await expect(resolvePlanTier(secrets)).resolves.toBe('pro_plus');
    await expect(resolveUsageMeter(secrets, 999)).resolves.toEqual({
      remaining: 0.75,
      resetsAt: '2026-06-01T00:00:00.000Z',
      usedTokens: 25_000,
      limitTokens: 100_000,
      source: 'managed-plan',
    });
  });

  it('does not invent remaining quota when managed usage totals are missing', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'hobby',
      resetsAt: '2026-06-01T00:00:00.000Z',
    });

    await expect(resolveUsageMeter(secrets, 6_200)).resolves.toEqual({
      remaining: null,
      resetsAt: '2026-06-01T00:00:00.000Z',
      source: 'managed-plan',
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
