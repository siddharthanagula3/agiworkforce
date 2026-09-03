import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  const catalog: Record<string, Record<string, unknown>> = {
    'fixture-anthropic-standard': {
      provider: 'anthropic',
      inputCost: 3.0,
      outputCost: 15.0,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6.0,
    },
    'fixture-scheduled-model': {
      provider: 'anthropic',
      inputCost: 3.0,
      outputCost: 15.0,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6.0,
      pricingSchedule: [
        {
          effectiveUntil: '2030-03-31',
          inputCost: 2.0,
          outputCost: 10.0,
          cached_input: 0.2,
          cached_write: 2.5,
          cached_write_1h: 4.0,
        },
        { effectiveFrom: '2030-04-01' },
      ],
    },
    'fixture-anthropic-premium': {
      provider: 'anthropic',
      inputCost: 5.0,
      outputCost: 25.0,
      cached_input: 0.5,
      cached_write: 6.25,
      cached_write_1h: 10.0,
    },
    'fixture-inclusive-tiered-primary': {
      provider: 'openai',
      inputCost: 5.0,
      outputCost: 30.0,
      cached_input: 0.5,
      cached_write: 6.25,
      inputTokenPricingTiers: [
        {
          thresholdTokens: 272_000,
          inputCost: 10,
          outputCost: 45,
          cached_input: 1,
          cached_write: 12.5,
        },
      ],
    },
    'fixture-inclusive-tiered-secondary': {
      provider: 'openai',
      inputCost: 2.0,
      outputCost: 12.0,
      cached_input: 0.2,
      cached_write: 2.5,
      inputTokenPricingTiers: [
        {
          thresholdTokens: 272_000,
          inputCost: 4,
          outputCost: 18,
          cached_input: 0.4,
          cached_write: 5,
        },
      ],
    },
    'fixture-no-cache-write': {
      provider: 'openai',
      inputCost: 0.75,
      outputCost: 4.5,
      cached_input: 0.075,
    },
    'fixture-disjoint-tiered-pricing': {
      provider: 'anthropic',
      inputCost: 1,
      outputCost: 4,
      cached_input: 0.1,
      cached_write: 1.25,
      inputTokenPricingTiers: [
        {
          thresholdTokens: 100_000,
          inputCost: 2,
          outputCost: 6,
          cached_input: 0.2,
          cached_write: 2.5,
        },
      ],
    },
    'fixture-inclusive-discounted-cache': {
      provider: 'deepseek',
      inputCost: 0.14,
      outputCost: 0.28,
      cached_input: 0.0028,
    },
    'fixture-inclusive-unpriced-cache': {
      provider: 'xai',
      inputCost: 2.0,
      outputCost: 10.0,
      capabilities: { caching: false },
    },
  };
  return {
    ...actual,
    getModelMetadataById: vi.fn((id: string) => catalog[id] ?? null),
  };
});

const SCHEDULED_MODEL = 'fixture-scheduled-model';
const INSIDE_FIRST_WINDOW = new Date('2030-02-15T00:00:00.000Z');
const LAST_DAY_OF_FIRST_WINDOW = new Date('2030-03-31T23:59:59.999Z');
const FIRST_DAY_OF_SECOND_WINDOW = new Date('2030-04-01T00:00:00.000Z');
const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');

import {
  recordModelUsage,
  getModelUsageReport,
  getSessionTotalCostUsd,
  resetModelUsage,
  resetAllSessions,
  toOtelAttributes,
  inferGenAiSystem,
} from '../cost-tracker';

const SESSION_A = 'session-a';
const SESSION_B = 'session-b';

beforeEach(() => {
  resetAllSessions();
});

describe('recordModelUsage', () => {
  it('creates a new session entry on first record', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    const report = getModelUsageReport(SESSION_A);
    expect(report.has('fixture-anthropic-standard')).toBe(true);
  });

  it('accumulates tokens across multiple calls for the same model', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 200,
      outputTokens: 100,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('fixture-anthropic-standard')!;
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(600);
    expect(usage.requestCount).toBe(2);
  });

  it('accumulates cache tokens', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 200,
      cacheCreationInputTokens: 800,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('fixture-anthropic-standard')!;
    expect(usage.cacheReadInputTokens).toBe(200);
    expect(usage.cacheCreationInputTokens).toBe(800);
  });

  it('keeps sessions isolated', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 100,
      outputTokens: 50,
    });
    recordModelUsage(SESSION_B, 'fixture-inclusive-tiered-primary', {
      inputTokens: 200,
      outputTokens: 100,
    });

    expect(getModelUsageReport(SESSION_A).has('fixture-anthropic-standard')).toBe(true);
    expect(getModelUsageReport(SESSION_A).has('fixture-inclusive-tiered-primary')).toBe(false);
    expect(getModelUsageReport(SESSION_B).has('fixture-inclusive-tiered-primary')).toBe(true);
    expect(getModelUsageReport(SESSION_B).has('fixture-anthropic-standard')).toBe(false);
  });

  it('tracks multiple models within the same session', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 100,
      outputTokens: 50,
    });
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 200,
      outputTokens: 100,
    });

    const report = getModelUsageReport(SESSION_A);
    expect(report.size).toBe(2);
  });
});

describe('cost calculation', () => {
  it('selects a tier from total disjoint input, including cache reads and writes', () => {
    const model = 'fixture-disjoint-tiered-pricing';
    recordModelUsage(SESSION_A, model, {
      inputTokens: 60_000,
      outputTokens: 0,
      cacheReadInputTokens: 25_000,
      cacheCreationInputTokens: 15_000,
    });
    recordModelUsage(SESSION_B, model, {
      inputTokens: 60_000,
      outputTokens: 0,
      cacheReadInputTokens: 25_000,
      cacheCreationInputTokens: 15_001,
    });

    expect(getModelUsageReport(SESSION_A).get(model)!.costUsd).toBeCloseTo(0.08125, 8);
    expect(getModelUsageReport(SESSION_B).get(model)!.costUsd).toBeCloseTo(0.1625025, 8);
  });

  it('calculates input/output cost from models.json pricing', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
      PRICED_ON,
    );

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-anthropic-standard')!.costUsd;
    expect(cost).toBeCloseTo(18.0, 4);
  });

  it('uses catalog cached_input price when present', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-premium', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-anthropic-premium')!.costUsd;
    expect(cost).toBeCloseTo(5.5, 4);
  });

  it('does not double-count cache reads for inclusive-prompt providers (deepseek)', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-discounted-cache', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-inclusive-discounted-cache')!.costUsd;
    expect(cost).toBeCloseTo(0.0028, 6);
  });

  it('bills only the uncached remainder at input rate for inclusive providers (openai)', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-secondary', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 400_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-inclusive-tiered-secondary')!.costUsd;
    expect(cost).toBeCloseTo(2.56, 4);
  });

  it('bills cache_read at the full input rate when the catalog prices none', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-unpriced-cache', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-inclusive-unpriced-cache')!.costUsd;
    expect(cost).toBeCloseTo(2.0, 6);
  });

  it('charges cache_creation at 125% of input rate', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
      },
      PRICED_ON,
    );

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-anthropic-standard')!.costUsd;
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

describe('worked cost examples, all token classes, per provider', () => {
  it('anthropic (disjoint input): applies Sonnet 5 catalog cache prices', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadInputTokens: 200_000,
        cacheCreationInputTokens: 800_000,
      },
      PRICED_ON,
    );
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-standard')!.costUsd).toBeCloseTo(
      4.11,
      6,
    );
  });

  it('anthropic (catalog cached_input): read billed at explicit rate, write at 1.25x', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-premium', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-premium')!.costUsd).toBeCloseTo(
      36.75,
      6,
    );
  });

  it('anthropic 1h cache write bills at 2x input; the 5m remainder at 1.25x', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
        cacheCreation1hInputTokens: 400_000,
      },
      PRICED_ON,
    );
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-standard')!.costUsd).toBeCloseTo(
      4.65,
      6,
    );
  });

  it('openai (inclusive prompt): cached subset subtracted from the input bucket', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 400_000,
    });
    expect(
      getModelUsageReport(SESSION_A).get('fixture-inclusive-tiered-primary')!.costUsd,
    ).toBeCloseTo(51.4, 6);
  });

  it('deepseek (inclusive prompt): fully-cached prompt bills only the discounted read rate', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-discounted-cache', {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadInputTokens: 1_000_000,
    });
    expect(
      getModelUsageReport(SESSION_A).get('fixture-inclusive-discounted-cache')!.costUsd,
    ).toBeCloseTo(0.1428, 6);
  });
});

describe('effective-dated pricing', () => {
  it('bills the first window rate for a request inside it', () => {
    recordModelUsage(
      SESSION_A,
      SCHEDULED_MODEL,
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      INSIDE_FIRST_WINDOW,
    );
    expect(getModelUsageReport(SESSION_A).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(12.0, 6);
  });

  it('bills the later window rate on and after the changeover date', () => {
    recordModelUsage(
      SESSION_A,
      SCHEDULED_MODEL,
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      FIRST_DAY_OF_SECOND_WINDOW,
    );
    expect(getModelUsageReport(SESSION_A).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(18.0, 6);
  });

  it('treats both window bounds as inclusive at the changeover boundary', () => {
    recordModelUsage(
      SESSION_A,
      SCHEDULED_MODEL,
      { inputTokens: 1_000_000, outputTokens: 0 },
      LAST_DAY_OF_FIRST_WINDOW,
    );
    expect(getModelUsageReport(SESSION_A).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(2.0, 6);

    recordModelUsage(
      SESSION_B,
      SCHEDULED_MODEL,
      { inputTokens: 1_000_000, outputTokens: 0 },
      FIRST_DAY_OF_SECOND_WINDOW,
    );
    expect(getModelUsageReport(SESSION_B).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(3.0, 6);
  });

  it('moves every cache rate with the window, not just input and output', () => {
    recordModelUsage(
      SESSION_A,
      SCHEDULED_MODEL,
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheCreation1hInputTokens: 1_000_000,
      },
      INSIDE_FIRST_WINDOW,
    );
    expect(getModelUsageReport(SESSION_A).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(4.2, 6);

    recordModelUsage(
      SESSION_B,
      SCHEDULED_MODEL,
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
        cacheCreation1hInputTokens: 1_000_000,
      },
      FIRST_DAY_OF_SECOND_WINDOW,
    );
    expect(getModelUsageReport(SESSION_B).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(6.3, 6);
  });

  it('prices Sonnet 5 identically on every date, founder Decision #22', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2026-08-15T00:00:00.000Z'),
    );
    recordModelUsage(
      SESSION_B,
      'fixture-anthropic-standard',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-standard')!.costUsd).toBeCloseTo(
      3.0,
      6,
    );
    expect(getModelUsageReport(SESSION_B).get('fixture-anthropic-standard')!.costUsd).toBeCloseTo(
      3.0,
      6,
    );
  });

  it('prices a model without a schedule identically on any date', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-premium',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2020-01-01T00:00:00.000Z'),
    );
    recordModelUsage(
      SESSION_B,
      'fixture-anthropic-premium',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2099-12-31T00:00:00.000Z'),
    );
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-premium')!.costUsd).toBeCloseTo(
      getModelUsageReport(SESSION_B).get('fixture-anthropic-premium')!.costUsd,
      10,
    );
  });
});

describe('OpenAI cache-write billing', () => {
  it('bills writes at the declared price for models that publish one', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-secondary', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(
      getModelUsageReport(SESSION_A).get('fixture-inclusive-tiered-secondary')!.costUsd,
    ).toBeCloseTo(5, 6);
  });

  it('keeps writes free when a model declares no write price', () => {
    const model = 'fixture-no-cache-write';
    recordModelUsage(SESSION_A, model, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });
    recordModelUsage(SESSION_B, model, {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const withWrites = getModelUsageReport(SESSION_A).get(model)!.costUsd;
    expect(withWrites).toBeCloseTo(0.75, 6);
    expect(withWrites).toBeCloseTo(getModelUsageReport(SESSION_B).get(model)!.costUsd, 10);
  });

  it('bills each prompt token exactly once across input, read, and write', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-secondary', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 400_000,
      cacheCreationInputTokens: 200_000,
    });
    expect(
      getModelUsageReport(SESSION_A).get('fixture-inclusive-tiered-secondary')!.costUsd,
    ).toBeCloseTo(2.76, 6);
  });

  it('keeps Anthropic disjoint accounting: cache tokens add to input, never subtract', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-premium', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('fixture-anthropic-premium')!.costUsd).toBeCloseTo(
      11.75,
      6,
    );
  });
});

describe('getSessionTotalCostUsd', () => {
  it('returns 0 for unknown session', () => {
    expect(getSessionTotalCostUsd('nonexistent')).toBe(0);
  });

  it('sums cost across all models in a session', () => {
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      { inputTokens: 1_000_000, outputTokens: 0 },
      PRICED_ON,
    );
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });

    const total = getSessionTotalCostUsd(SESSION_A);
    expect(total).toBeCloseTo(13.0, 4);
  });
});

describe('getModelUsageReport', () => {
  it('returns empty Map for unknown session', () => {
    const report = getModelUsageReport('does-not-exist');
    expect(report.size).toBe(0);
  });

  it('returns a snapshot (mutations do not affect store)', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 100,
      outputTokens: 50,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('fixture-inclusive-tiered-primary')!;
    usage.inputTokens = 9999;

    const report2 = getModelUsageReport(SESSION_A);
    expect(report2.get('fixture-inclusive-tiered-primary')!.inputTokens).toBe(100);
  });
});

describe('resetModelUsage', () => {
  it('removes only the specified session', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 100,
      outputTokens: 50,
    });
    recordModelUsage(SESSION_B, 'fixture-inclusive-tiered-primary', {
      inputTokens: 200,
      outputTokens: 100,
    });

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
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 100,
      outputTokens: 50,
    });
    recordModelUsage(SESSION_B, 'fixture-inclusive-tiered-primary', {
      inputTokens: 200,
      outputTokens: 100,
    });

    resetAllSessions();

    expect(getModelUsageReport(SESSION_A).size).toBe(0);
    expect(getModelUsageReport(SESSION_B).size).toBe(0);
  });
});

describe('reasoningOutputTokens', () => {
  it('accumulates reasoningOutputTokens across calls', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
    });
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 100,
      outputTokens: 50,
      reasoningOutputTokens: 80,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('fixture-inclusive-tiered-primary')!;
    expect(usage.reasoningOutputTokens).toBe(280);
  });

  it('initializes reasoningOutputTokens to 0 when absent', () => {
    recordModelUsage(SESSION_A, 'fixture-anthropic-standard', {
      inputTokens: 100,
      outputTokens: 50,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('fixture-anthropic-standard')!;
    expect(usage.reasoningOutputTokens).toBe(0);
  });

  it('charges reasoning tokens at the output token rate', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-inclusive-tiered-primary')!.costUsd;
    expect(cost).toBeCloseTo(30.0, 4);
  });

  it('adds reasoning cost on top of input + output cost', () => {
    recordModelUsage(SESSION_A, 'fixture-inclusive-tiered-primary', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningOutputTokens: 500_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('fixture-inclusive-tiered-primary')!.costUsd;
    expect(cost).toBeCloseTo(77.5, 4);
  });
});

describe('inferGenAiSystem', () => {
  it.each([
    ['anthropic', 'anthropic'],
    ['openai', 'openai'],
    ['google', 'google_ai_studio'],
    ['xai', 'xai'],
    ['deepseek', 'deepseek'],
    ['perplexity', 'perplexity'],
    ['openrouter', 'openrouter'],
    ['ollama', 'ollama'],
    ['lmstudio', 'lmstudio'],
  ])('maps %s -> %s', (input, expected) => {
    expect(inferGenAiSystem(input)).toBe(expected);
  });

  it('returns lowercase raw provider for unknown providers', () => {
    expect(inferGenAiSystem('MyCustomProvider')).toBe('mycustomprovider');
  });
});

describe('toOtelAttributes', () => {
  it('includes standard GenAI semantic convention fields', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['gen_ai.system']).toBe('openai');
    expect(attrs['gen_ai.request.model']).toBe('fixture-inclusive-tiered-primary');
    expect(attrs['gen_ai.usage.input_tokens']).toBe(1000);
    expect(attrs['gen_ai.usage.output_tokens']).toBe(500);
  });

  it('includes cache_read attribute when cacheReadInputTokens is provided', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheReadInputTokens: 800,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBe(800);
  });

  it('omits cache_read attribute when cacheReadInputTokens is absent', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBeUndefined();
  });

  it('includes codex.usage.cache_creation_input_tokens when provided', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheCreationInputTokens: 1200,
    });

    expect(attrs['codex.usage.cache_creation_input_tokens']).toBe(1200);
  });

  it('includes codex.usage.reasoning_output_tokens when provided', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 256,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBe(256);
  });

  it('omits codex.usage.reasoning_output_tokens when absent', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBeUndefined();
  });

  it('computes total_tokens as input + output + reasoning + cache_creation', () => {
    const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
      cacheCreationInputTokens: 300,
    });

    expect(attrs['codex.usage.total_tokens']).toBe(2000);
  });

  it('total_tokens excludes cache_read (reads are not net-new tokens)', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 800, // not counted in total
    });

    expect(attrs['codex.usage.total_tokens']).toBe(1500);
  });

  it('uses inferGenAiSystem to map provider to gen_ai.system', () => {
    const attrs = toOtelAttributes('google', 'fixture-model', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.system']).toBe('google_ai_studio');
  });

  describe('CPST vendor attributes', () => {
    it('emits no codex.usage CPST attribute when no CPST fields are supplied', () => {
      const attrs = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', {
        inputTokens: 100,
        outputTokens: 50,
      });

      expect('codex.usage.task_outcome' in attrs).toBe(false);
      expect('codex.usage.retries' in attrs).toBe(false);
      expect('codex.usage.fallback_used' in attrs).toBe(false);
      expect('codex.usage.verifier_result' in attrs).toBe(false);
      expect('codex.usage.route_plan_id' in attrs).toBe(false);
      expect('codex.usage.task_family' in attrs).toBe(false);
      expect('codex.usage.task_family_confidence' in attrs).toBe(false);
    });

    it('mirrors every populated CPST field into the codex.usage namespace', () => {
      const attrs = toOtelAttributes(
        'anthropic',
        'fixture-anthropic-standard',
        { inputTokens: 10, outputTokens: 5 },
        {
          taskOutcome: 'unknown',
          verifierResult: 'skipped',
          fallbackUsed: true,
          fallbackReason: 'managed_failover',
          retries: 2,
          routePlanId: 'interim:anthropic/messages:route-1:fallback_slot',
          taskFamily: 'coding',
          taskFamilyConfidence: 0.75,
        },
      );

      expect(attrs['codex.usage.task_outcome']).toBe('unknown');
      expect(attrs['codex.usage.verifier_result']).toBe('skipped');
      expect(attrs['codex.usage.fallback_used']).toBe(true);
      expect(attrs['codex.usage.fallback_reason']).toBe('managed_failover');
      expect(attrs['codex.usage.retries']).toBe(2);
      expect(attrs['codex.usage.route_plan_id']).toBe(
        'interim:anthropic/messages:route-1:fallback_slot',
      );
      expect(attrs['codex.usage.task_family']).toBe('coding');
      expect(attrs['codex.usage.task_family_confidence']).toBe(0.75);
    });

    it('keeps an absent CPST field absent instead of defaulting it', () => {
      const attrs = toOtelAttributes(
        'openai',
        'fixture-inclusive-tiered-primary',
        { inputTokens: 10, outputTokens: 5 },
        { taskOutcome: 'failure', verifierResult: 'skipped' },
      );

      expect(attrs['codex.usage.task_outcome']).toBe('failure');
      expect('codex.usage.retries' in attrs).toBe(false);
      expect('codex.usage.fallback_used' in attrs).toBe(false);
      expect('codex.usage.route_plan_id' in attrs).toBe(false);
      expect('codex.usage.task_family' in attrs).toBe(false);
    });

    it('emits fallback_used:false as a real false, not as an omission', () => {
      const attrs = toOtelAttributes(
        'openai',
        'fixture-inclusive-tiered-primary',
        { inputTokens: 10, outputTokens: 5 },
        { fallbackUsed: false, retries: 0 },
      );

      expect(attrs['codex.usage.fallback_used']).toBe(false);
      expect(attrs['codex.usage.retries']).toBe(0);
    });

    it('leaves the token attributes byte-identical whether or not CPST is passed', () => {
      const usage = { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 300 };
      const withoutCpst = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', usage);
      const withCpst = toOtelAttributes('openai', 'fixture-inclusive-tiered-primary', usage, {
        taskOutcome: 'unknown',
      });

      for (const key of Object.keys(withoutCpst)) {
        expect(withCpst[key]).toBe(withoutCpst[key]);
      }
      expect(Object.keys(withCpst)).toEqual([
        ...Object.keys(withoutCpst),
        'codex.usage.task_outcome',
      ]);
    });
  });
});
