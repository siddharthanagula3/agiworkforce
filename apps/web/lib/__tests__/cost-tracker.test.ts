import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock @agiworkforce/types so we control pricing without needing the actual catalog.
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: vi.fn((id: string) => {
    // `provider` is load-bearing: the cost tracker uses it to decide token
    // accounting (Anthropic reports input DISJOINT from cache tokens; OpenAI/
    // Gemini/DeepSeek report INCLUSIVE prompt counts where cache tokens are a
    // subset that must be subtracted before billing input).
    const catalog: Record<string, Record<string, unknown>> = {
      'claude-sonnet-5': {
        provider: 'anthropic',
        inputCost: 3.0,
        outputCost: 15.0,
        cached_input: 0.3,
        cached_write: 3.75,
        cached_write_1h: 6.0,
      },
      'claude-opus-4.8': {
        provider: 'anthropic',
        inputCost: 5.0,
        outputCost: 25.0,
        cached_input: 0.5,
        cached_write: 6.25,
        cached_write_1h: 10.0,
      },
      'gpt-5.5': { provider: 'openai', inputCost: 5.0, outputCost: 30.0 },
      'deepseek-v4-flash': {
        provider: 'deepseek',
        inputCost: 0.14,
        outputCost: 0.28,
        cached_input: 0.0028,
      },
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
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    const report = getModelUsageReport(SESSION_A);
    expect(report.has('claude-sonnet-5')).toBe(true);
  });

  it('accumulates tokens across multiple calls for the same model', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 1000, outputTokens: 500 });
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 200, outputTokens: 100 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-5')!;
    expect(usage.inputTokens).toBe(1200);
    expect(usage.outputTokens).toBe(600);
    expect(usage.requestCount).toBe(2);
  });

  it('accumulates cache tokens', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 200,
      cacheCreationInputTokens: 800,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-5')!;
    expect(usage.cacheReadInputTokens).toBe(200);
    expect(usage.cacheCreationInputTokens).toBe(800);
  });

  it('keeps sessions isolated', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    expect(getModelUsageReport(SESSION_A).has('claude-sonnet-5')).toBe(true);
    expect(getModelUsageReport(SESSION_A).has('gpt-5.5')).toBe(false);
    expect(getModelUsageReport(SESSION_B).has('gpt-5.5')).toBe(true);
    expect(getModelUsageReport(SESSION_B).has('claude-sonnet-5')).toBe(false);
  });

  it('tracks multiple models within the same session', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_A, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    const report = getModelUsageReport(SESSION_A);
    expect(report.size).toBe(2);
  });
});

describe('cost calculation', () => {
  it('calculates input/output cost from models.json pricing', () => {
    // claude-sonnet-5: $3/M input, $15/M output
    // 1M input + 1M output = $3 + $15 = $18
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-5')!.costUsd;
    expect(cost).toBeCloseTo(18.0, 4);
  });

  it('uses catalog cached_input price when present', () => {
    // claude-opus-4.8: inputCost=$5, cached_input=$0.5
    // 1M input + 1M cache_read = $5 + $0.5 = $5.5
    recordModelUsage(SESSION_A, 'claude-opus-4.8', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-opus-4.8')!.costUsd;
    expect(cost).toBeCloseTo(5.5, 4);
  });

  it('does not double-count cache reads for inclusive-prompt providers (deepseek)', () => {
    // deepseek-v4-flash: input=$0.14/M, cached_input=$0.0028/M. DeepSeek reports
    // prompt_tokens INCLUSIVE of cache hits, so a 1M prompt with 1M cache hits is
    // entirely cached. Correct cost = 1M * $0.0028 = $0.0028, NOT
    // 1M*$0.14 + 1M*$0.0028 (the old double-count bug = $0.1428).
    recordModelUsage(SESSION_A, 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('deepseek-v4-flash')!.costUsd;
    expect(cost).toBeCloseTo(0.0028, 6);
  });

  it('bills only the uncached remainder at input rate for inclusive providers (openai)', () => {
    // gpt-5.5: input=$5/M, no catalog cached_input → cache_read falls back to 10%
    // of input = $0.5/M. 1M prompt with 400k cache hits: 600k billed at $5/M +
    // 400k at $0.5/M = $3.0 + $0.2 = $3.2 (NOT $5 + $0.2 = $5.2).
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 400_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.5')!.costUsd;
    expect(cost).toBeCloseTo(3.2, 4);
  });

  it('falls back to 10% of input rate for cache_read when cached_input is absent', () => {
    // gpt-5.5: inputCost=$5, no cached_input in this fixture.
    // 1M cache_read = 10% of $5 = $0.5.
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.5')!.costUsd;
    expect(cost).toBeCloseTo(0.5, 4);
  });

  it('charges cache_creation at 125% of input rate', () => {
    // claude-sonnet-5: catalog cacheCreation = $3.75/M
    // 1M cache_creation = $3.75
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-5')!.costUsd;
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

// Worked cost examples that exercise ALL FOUR token classes (input, output,
// cache-read, cache-write) at once, pinning the per-class multipliers to a
// known token mix → an exact dollar total. Anthropic multipliers verified
// against the official prompt-caching pricing page (2026-07):
//   https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
//   cache read = 0.1x base input · 5-minute cache write = 1.25x · 1-hour = 2x.
// The pipeline also carries the 1-hour cache-write subset so it can bill that
// portion at 2x while billing the remainder at the 5-minute 1.25x rate.
describe('worked cost examples — all token classes, per provider', () => {
  it('anthropic (disjoint input): applies Sonnet 5 catalog cache prices', () => {
    // claude-sonnet-5: input=$3/M, output=$15/M, cache-read=$0.3/M,
    // cache-write=$3.75/M.
    //   input      100k * 3    /1e6 = $0.30   (Anthropic input_tokens are disjoint → full, no subtraction)
    //   output      50k * 15   /1e6 = $0.75
    //   cache-read 200k * 0.30 /1e6 = $0.06
    //   cache-write800k * 3.75 /1e6 = $3.00
    //   total = $4.11
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadInputTokens: 200_000,
      cacheCreationInputTokens: 800_000,
    });
    expect(getModelUsageReport(SESSION_A).get('claude-sonnet-5')!.costUsd).toBeCloseTo(4.11, 6);
  });

  it('anthropic (catalog cached_input): read billed at explicit rate, write at 1.25x', () => {
    // claude-opus-4.8: input=$5/M, output=$25/M, cache-read=$0.5/M,
    // cache-write=$6.25/M.
    //   input       1M * 5    /1e6 = $5.00
    //   output      1M * 25   /1e6 = $25.00
    //   cache-read  1M * 0.50 /1e6 = $0.50
    //   cache-write 1M * 6.25 /1e6 = $6.25
    //   total = $36.75
    recordModelUsage(SESSION_A, 'claude-opus-4.8', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('claude-opus-4.8')!.costUsd).toBeCloseTo(36.75, 6);
  });

  it('anthropic 1h cache write bills at 2x input; the 5m remainder at 1.25x', () => {
    // claude-sonnet-5: 5m cache-write=$3.75/M, 1h cache-write=$6/M.
    //   1h write 400k * (3 * 2.0  = $6.00/M) /1e6 = $2.40
    //   5m write 600k * (3 * 1.25 = $3.75/M) /1e6 = $2.25   (1M total − 400k @ 1h)
    //   total = $4.65
    // Exercises the 2x 1h premium explicitly — the other examples leave
    // cacheCreation1hInputTokens at 0, so only this case can fail on that rate.
    recordModelUsage(SESSION_A, 'claude-sonnet-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 400_000,
    });
    expect(getModelUsageReport(SESSION_A).get('claude-sonnet-5')!.costUsd).toBeCloseTo(4.65, 6);
  });

  it('openai (inclusive prompt): cached subset subtracted from input, read at 0.1x fallback', () => {
    // gpt-5.5: input=$5/M, output=$30/M, no catalog cached_input → read = 0.1*5 = $0.5/M.
    // OpenAI prompt_tokens INCLUDE the cached hits, so the cached subset is
    // subtracted from the billable-input bucket (billed once, at the read rate).
    //   billable input (1M - 400k) 600k * 5   /1e6 = $3.00
    //   cache-read                 400k * 0.5 /1e6 = $0.20
    //   output                      1M  * 30  /1e6 = $30.00
    //   total = $33.20
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 400_000,
    });
    expect(getModelUsageReport(SESSION_A).get('gpt-5.5')!.costUsd).toBeCloseTo(33.2, 6);
  });

  it('deepseek (inclusive prompt): fully-cached prompt bills only the discounted read rate', () => {
    // deepseek-v4-flash: input=$0.14/M, output=$0.28/M, catalog cached_input=$0.0028/M.
    //   billable input (1M - 1M)   0 * 0.14   /1e6 = $0.00
    //   cache-read                1M * 0.0028 /1e6 = $0.0028
    //   output                   500k * 0.28  /1e6 = $0.14
    //   total = $0.1428
    recordModelUsage(SESSION_A, 'deepseek-v4-flash', {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('deepseek-v4-flash')!.costUsd).toBeCloseTo(0.1428, 6);
  });
});

describe('getSessionTotalCostUsd', () => {
  it('returns 0 for unknown session', () => {
    expect(getSessionTotalCostUsd('nonexistent')).toBe(0);
  });

  it('sums cost across all models in a session', () => {
    // claude-sonnet-5: $3/M input → 1M = $3
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 0 });
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
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
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
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.5', { inputTokens: 200, outputTokens: 100 });

    resetAllSessions();

    expect(getModelUsageReport(SESSION_A).size).toBe(0);
    expect(getModelUsageReport(SESSION_B).size).toBe(0);
  });
});

describe('reasoningOutputTokens', () => {
  it('accumulates reasoningOutputTokens across calls', () => {
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
    });
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 100,
      outputTokens: 50,
      reasoningOutputTokens: 80,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('gpt-5.5')!;
    expect(usage.reasoningOutputTokens).toBe(280);
  });

  it('initializes reasoningOutputTokens to 0 when absent', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-5')!;
    expect(usage.reasoningOutputTokens).toBe(0);
  });

  it('charges reasoning tokens at the output token rate', () => {
    // gpt-5.5: outputCost=$30/M
    // 1M reasoning tokens = $30
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.5')!.costUsd;
    expect(cost).toBeCloseTo(30.0, 4);
  });

  it('adds reasoning cost on top of input + output cost', () => {
    // gpt-5.5: input=$5/M, output=$30/M
    // 1M input + 1M output + 500k reasoning = $5 + $30 + $15 = $50
    recordModelUsage(SESSION_A, 'gpt-5.5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningOutputTokens: 500_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.5')!.costUsd;
    expect(cost).toBeCloseTo(50.0, 4);
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
    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['gen_ai.system']).toBe('openai');
    expect(attrs['gen_ai.request.model']).toBe('gpt-5.5');
    expect(attrs['gen_ai.usage.input_tokens']).toBe(1000);
    expect(attrs['gen_ai.usage.output_tokens']).toBe(500);
  });

  it('includes cache_read attribute when cacheReadInputTokens is provided', () => {
    const attrs = toOtelAttributes('anthropic', 'claude-sonnet-5', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheReadInputTokens: 800,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBe(800);
  });

  it('omits cache_read attribute when cacheReadInputTokens is absent', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.usage.cache_read.input_tokens']).toBeUndefined();
  });

  it('includes codex.usage.cache_creation_input_tokens when provided', () => {
    const attrs = toOtelAttributes('anthropic', 'claude-sonnet-5', {
      inputTokens: 2000,
      outputTokens: 300,
      cacheCreationInputTokens: 1200,
    });

    expect(attrs['codex.usage.cache_creation_input_tokens']).toBe(1200);
  });

  it('includes codex.usage.reasoning_output_tokens when provided', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 256,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBe(256);
  });

  it('omits codex.usage.reasoning_output_tokens when absent', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBeUndefined();
  });

  it('computes total_tokens as input + output + reasoning + cache_creation', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.5', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
      cacheCreationInputTokens: 300,
    });

    // total = 1000 + 500 + 200 + 300 = 2000
    expect(attrs['codex.usage.total_tokens']).toBe(2000);
  });

  it('total_tokens excludes cache_read (reads are not net-new tokens)', () => {
    const attrs = toOtelAttributes('anthropic', 'claude-sonnet-5', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 800, // not counted in total
    });

    // total = 1000 + 500 = 1500 (cache reads excluded)
    expect(attrs['codex.usage.total_tokens']).toBe(1500);
  });

  it('uses inferGenAiSystem to map provider to gen_ai.system', () => {
    const attrs = toOtelAttributes('google', 'gemini-2.0-flash', {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(attrs['gen_ai.system']).toBe('google_ai_studio');
  });
});
