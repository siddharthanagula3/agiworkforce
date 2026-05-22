import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock @agiworkforce/types so we control pricing without needing the actual catalog.
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: vi.fn((id: string) => {
    const catalog: Record<string, Record<string, unknown>> = {
      'claude-sonnet-4-6': { inputCost: 3.0, outputCost: 15.0 },
      'claude-opus-4.7': { inputCost: 5.0, outputCost: 25.0, cached_input: 0.3 },
      'gpt-5.5': { inputCost: 5.0, outputCost: 30.0 },
      'deepseek-v4-flash': { inputCost: 0.14, outputCost: 0.28, cached_input: 0.0028 },
    };
    return catalog[id] ?? null;
  }),
}));

import {
  recordModelUsage,
  getModelUsageReport,
  getSessionTotalCostUsd,
  resetModelUsage,
  resetAllSessions,
} from '../cost-tracker';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

beforeEach(() => {
  resetAllSessions();
});

describe('recordModelUsage', () => {
  it('creates a new session entry on first record', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    const report = getModelUsageReport(SESSION_A);
    expect(report.has('claude-sonnet-4-6')).toBe(true);
  });

  it('accumulates tokens across multiple calls for the same model', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 1000, outputTokens: 500 });
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 200, outputTokens: 100 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-4-6')!;
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(600);
    expect(usage.requestCount).toBe(2);
  });

  it('accumulates cache tokens', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 200,
      cacheCreationInputTokens: 800,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-4-6')!;
    expect(usage.cacheReadInputTokens).toBe(200);
    expect(usage.cacheCreationInputTokens).toBe(800);
  });

  it('keeps sessions isolated', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    expect(getModelUsageReport(SESSION_A).has('claude-sonnet-4-6')).toBe(true);
    expect(getModelUsageReport(SESSION_A).has('gpt-5.5')).toBe(false);
    expect(getModelUsageReport(SESSION_B).has('gpt-5.5')).toBe(true);
    expect(getModelUsageReport(SESSION_B).has('claude-sonnet-4-6')).toBe(false);
  });

  it('tracks multiple models within the same session', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_A, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    const report = getModelUsageReport(SESSION_A);
    expect(report.size).toBe(2);
  });
});

describe('cost calculation', () => {
  it('calculates input/output cost from models.json pricing', () => {
    // claude-sonnet-4-6: $3/M input, $15/M output
    // 1M input + 1M output = $3 + $15 = $18
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-4-6')!.costUsd;
    expect(cost).toBeCloseTo(18.0, 4);
  });

  it('uses catalog cached_input price when present', () => {
    // claude-opus-4.7: inputCost=$5, cached_input=$0.3
    // 1M input + 1M cache_read = $5 + $0.3 = $5.3
    recordModelUsage(SESSION_A, 'claude-opus-4.7', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-opus-4.7')!.costUsd;
    expect(cost).toBeCloseTo(5.3, 4);
  });

  it('falls back to 10% of input rate for cache_read when cached_input absent', () => {
    // claude-sonnet-4-6: inputCost=$3, no cached_input in catalog
    // cache_read = 10% of $3 = $0.3/M
    // 1M cache_read = $0.3
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-4-6')!.costUsd;
    expect(cost).toBeCloseTo(0.3, 4);
  });

  it('charges cache_creation at 125% of input rate', () => {
    // claude-sonnet-4-6: inputCost=$3, cacheCreation = $3 * 1.25 = $3.75/M
    // 1M cache_creation = $3.75
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-4-6')!.costUsd;
    expect(cost).toBeCloseTo(3.75, 4);
  });

  it('returns $0 cost for unknown model', () => {
    recordModelUsage(SESSION_A, 'unknown-model-xyz', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('unknown-model-xyz')!.costUsd;
    expect(cost).toBe(0);
  });
});

describe('getSessionTotalCostUsd', () => {
  it('returns 0 for unknown session', () => {
    expect(getSessionTotalCostUsd('nonexistent')).toBe(0);
  });

  it('sums cost across all models in a session', () => {
    // claude-sonnet-4-6: $3/M input → 1M = $3
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 1_000_000, outputTokens: 0 });
    // gpt-5.5: $5/M input → 1M = $5
    recordModelUsage(SESSION_A, 'gpt-5.5', { inputTokens: 1_000_000, outputTokens: 0 });

    const total = getSessionTotalCostUsd(SESSION_A);
    expect(total).toBeCloseTo(8.0, 4);
  });
});

describe('getModelUsageReport', () => {
  it('returns empty Map for unknown session', () => {
    const report = getModelUsageReport('does-not-exist');
    expect(report.size).toBe(0);
  });

  it('returns a snapshot (mutations do not affect store)', () => {
    recordModelUsage(SESSION_A, 'gpt-5.5', { inputTokens: 100, outputTokens: 50 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('gpt-5.5')!;
    usage.inputTokens = 9999; // mutate snapshot

    // Store should be unaffected
    const report2 = getModelUsageReport(SESSION_A);
    expect(report2.get('gpt-5.5')!.inputTokens).toBe(100);
  });
});

describe('resetModelUsage', () => {
  it('removes only the specified session', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    resetModelUsage(SESSION_A);

    expect(getModelUsageReport(SESSION_A).size).toBe(0);
    expect(getModelUsageReport(SESSION_B).size).toBe(1);
  });

  it('is a no-op for unknown session', () => {
    expect(() => resetModelUsage('nonexistent')).not.toThrow();
  });
});

describe('resetAllSessions', () => {
  it('clears all sessions', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-4-6', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    resetAllSessions();

    expect(getModelUsageReport(SESSION_A).size).toBe(0);
    expect(getModelUsageReport(SESSION_B).size).toBe(0);
  });
});
