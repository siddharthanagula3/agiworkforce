import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock ONLY the catalog lookup so pricing is controlled without needing the real
// catalog. `resolveEffectiveModelPricing` is deliberately left REAL: it is the
// shared, pure date-window resolver, and stubbing it would test nothing.
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  // `provider` is load-bearing: the cost tracker uses it to decide token
  // accounting (Anthropic reports input DISJOINT from cache tokens; OpenAI/
  // Gemini/DeepSeek report INCLUSIVE prompt counts where cache tokens are a
  // subset that must be subtracted before billing input).
  const catalog: Record<string, Record<string, unknown>> = {
    // Mirrors the shipped catalog: ONE price on every date. Founder Decision
    // #22 (reaffirmed 2026-08-05) — Sonnet 5 bills the standard $3/$15 per MTok
    // regardless of date; a provider's introductory window is a provider-cost
    // fact, not a product price.
    'claude-sonnet-5': {
      provider: 'anthropic',
      inputCost: 3.0,
      outputCost: 15.0,
      cached_input: 0.3,
      cached_write: 3.75,
      cached_write_1h: 6.0,
    },
    // SYNTHETIC scheduled model. Its window dates are arbitrary and belong to
    // no product price: the dated-window mechanism is proved here so it stays
    // covered without a live promotional window to lean on.
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
    'claude-opus-5': {
      provider: 'anthropic',
      inputCost: 5.0,
      outputCost: 25.0,
      cached_input: 0.5,
      cached_write: 6.25,
      cached_write_1h: 10.0,
    },
    'gpt-5.6-sol': {
      provider: 'openai',
      inputCost: 5.0,
      outputCost: 30.0,
      cached_input: 0.5,
    },
    // GPT-5.6 declares a cache-WRITE price (1.25x the uncached input rate).
    'gpt-5.6-terra': {
      provider: 'openai',
      inputCost: 2.0,
      outputCost: 12.0,
      cached_input: 0.2,
      cached_write: 2.5,
    },
    // Pre-5.6 OpenAI: no write price declared, so cache writes stay free.
    'gpt-5.4-mini': {
      provider: 'openai',
      inputCost: 0.75,
      outputCost: 4.5,
      cached_input: 0.075,
    },
    'deepseek-v4-flash': {
      provider: 'deepseek',
      inputCost: 0.14,
      outputCost: 0.28,
      cached_input: 0.0028,
    },
    // Mirrors the shipped catalog: prices no cache read, so its reads take the
    // shared fallback. grok-4.5 is the live case — it is in
    // tierAllowedModels.flagship_additions and its OpenAI-shaped stream fills
    // cache-read counts — and it does NOT declare caching, which is the proof
    // that the fallback keys on the missing price and not on the capability.
    // minimax-m3 is the same shape with caching declared, but no tier list
    // includes it.
    'grok-4.5': {
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

/**
 * Fixed pricing dates. Cost is billed at the request's date, so every assertion
 * pins one of these rather than reading the clock. The `SCHEDULED_*` dates
 * bracket the SYNTHETIC fixture's window boundary; `PRICED_ON` is an ordinary
 * date used wherever the model has one price on every date.
 */
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
    recordModelUsage(SESSION_B, 'gpt-5.6-sol', { inputTokens: 200, outputTokens: 100 });

    expect(getModelUsageReport(SESSION_A).has('claude-sonnet-5')).toBe(true);
    expect(getModelUsageReport(SESSION_A).has('gpt-5.6-sol')).toBe(false);
    expect(getModelUsageReport(SESSION_B).has('gpt-5.6-sol')).toBe(true);
    expect(getModelUsageReport(SESSION_B).has('claude-sonnet-5')).toBe(false);
  });

  it('tracks multiple models within the same session', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', { inputTokens: 200, outputTokens: 100 });

    const report = getModelUsageReport(SESSION_A);
    expect(report.size).toBe(2);
  });
});

describe('cost calculation', () => {
  it('calculates input/output cost from models.json pricing', () => {
    // claude-sonnet-5: $3/M input, $15/M output on every date.
    // 1M input + 1M output = $3 + $15 = $18
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
      PRICED_ON,
    );

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-sonnet-5')!.costUsd;
    expect(cost).toBeCloseTo(18.0, 4);
  });

  it('uses catalog cached_input price when present', () => {
    // claude-opus-5: inputCost=$5, cached_input=$0.5
    // 1M input + 1M cache_read = $5 + $0.5 = $5.5
    recordModelUsage(SESSION_A, 'claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('claude-opus-5')!.costUsd;
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
    // gpt-5.6-terra: input=$2/M, cached_input=$0.2/M. 1M prompt with 400k cache
    // hits: 600k billed at $2/M + 400k at $0.2/M = $1.2 + $0.08 = $1.28
    // (NOT $2 + $0.08 = $2.08).
    recordModelUsage(SESSION_A, 'gpt-5.6-terra', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 400_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.6-terra')!.costUsd;
    expect(cost).toBeCloseTo(1.28, 4);
  });

  it('bills cache_read at the full input rate when the catalog prices none', () => {
    // grok-4.5 prices no cache read, so its reads bill at the full $2/M — the
    // rate the desktop calculator and the gateway charge for the same request.
    // A 90%-off fallback here would bill $0.20/M for a discount the catalog
    // does not publish.
    recordModelUsage(SESSION_A, 'grok-4.5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('grok-4.5')!.costUsd;
    expect(cost).toBeCloseTo(2.0, 6);
  });

  it('charges cache_creation at 125% of input rate', () => {
    // claude-sonnet-5: catalog cacheCreation = $3.75/M
    // 1M cache_creation = $3.75
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
      },
      PRICED_ON,
    );

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
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadInputTokens: 200_000,
        cacheCreationInputTokens: 800_000,
      },
      PRICED_ON,
    );
    expect(getModelUsageReport(SESSION_A).get('claude-sonnet-5')!.costUsd).toBeCloseTo(4.11, 6);
  });

  it('anthropic (catalog cached_input): read billed at explicit rate, write at 1.25x', () => {
    // claude-opus-5: input=$5/M, output=$25/M, cache-read=$0.5/M,
    // cache-write=$6.25/M.
    //   input       1M * 5    /1e6 = $5.00
    //   output      1M * 25   /1e6 = $25.00
    //   cache-read  1M * 0.50 /1e6 = $0.50
    //   cache-write 1M * 6.25 /1e6 = $6.25
    //   total = $36.75
    recordModelUsage(SESSION_A, 'claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('claude-opus-5')!.costUsd).toBeCloseTo(36.75, 6);
  });

  it('anthropic 1h cache write bills at 2x input; the 5m remainder at 1.25x', () => {
    // claude-sonnet-5: 5m cache-write=$3.75/M, 1h cache-write=$6/M.
    //   1h write 400k * (3 * 2.0  = $6.00/M) /1e6 = $2.40
    //   5m write 600k * (3 * 1.25 = $3.75/M) /1e6 = $2.25   (1M total − 400k @ 1h)
    //   total = $4.65
    // Exercises the 2x 1h premium explicitly — the other examples leave
    // cacheCreation1hInputTokens at 0, so only this case can fail on that rate.
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
        cacheCreation1hInputTokens: 400_000,
      },
      PRICED_ON,
    );
    expect(getModelUsageReport(SESSION_A).get('claude-sonnet-5')!.costUsd).toBeCloseTo(4.65, 6);
  });

  it('openai (inclusive prompt): cached subset subtracted from the input bucket', () => {
    // gpt-5.6-sol: input=$5/M, output=$30/M, catalog cached_input=$0.5/M.
    // OpenAI prompt_tokens INCLUDE the cached hits, so the cached subset is
    // subtracted from the billable-input bucket (billed once, at the read rate).
    //   billable input (1M - 400k) 600k * 5   /1e6 = $3.00
    //   cache-read                 400k * 0.5 /1e6 = $0.20
    //   output                      1M  * 30  /1e6 = $30.00
    //   total = $33.20
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 400_000,
    });
    expect(getModelUsageReport(SESSION_A).get('gpt-5.6-sol')!.costUsd).toBeCloseTo(33.2, 6);
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

// Effective-dated pricing, proved against the SYNTHETIC fixture model above —
// arbitrary window dates that belong to no product price. Bounds are UTC
// calendar days, inclusive on both sides, so the changeover happens at UTC
// midnight. Every case pins a fixed date on one side of that boundary and none
// of them can drift with the calendar.
//
// Sonnet 5 deliberately does NOT appear here: founder Decision #22 (reaffirmed
// 2026-08-05) prices it identically on every date, which the pin below asserts.
describe('effective-dated pricing', () => {
  it('bills the first window rate for a request inside it', () => {
    // First window: $2/M input, $10/M output → 1M + 1M = $12.
    recordModelUsage(
      SESSION_A,
      SCHEDULED_MODEL,
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      INSIDE_FIRST_WINDOW,
    );
    expect(getModelUsageReport(SESSION_A).get(SCHEDULED_MODEL)!.costUsd).toBeCloseTo(12.0, 6);
  });

  it('bills the later window rate on and after the changeover date', () => {
    // The second window declares only its start, so it inherits the top-level
    // rates: $3/M input, $15/M output → 1M + 1M = $18.
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
    // First window cache rates: read $0.2/M, 5m write $2.5/M, 1h write $4/M.
    //   read     1M * 0.2 /1e6 = $0.20
    //   1h write 1M * 4.0 /1e6 = $4.00
    //   total = $4.20
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

    // Inherited rates in the second window: read $0.3/M, 1h write $6/M → $6.30.
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

  it('prices Sonnet 5 identically on every date — founder Decision #22', () => {
    // $3/M input on both sides of the retired 2026-09-01 boundary.
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2026-08-15T00:00:00.000Z'),
    );
    recordModelUsage(
      SESSION_B,
      'claude-sonnet-5',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(getModelUsageReport(SESSION_A).get('claude-sonnet-5')!.costUsd).toBeCloseTo(3.0, 6);
    expect(getModelUsageReport(SESSION_B).get('claude-sonnet-5')!.costUsd).toBeCloseTo(3.0, 6);
  });

  it('prices a model without a schedule identically on any date', () => {
    recordModelUsage(
      SESSION_A,
      'claude-opus-5',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2020-01-01T00:00:00.000Z'),
    );
    recordModelUsage(
      SESSION_B,
      'claude-opus-5',
      { inputTokens: 1_000_000, outputTokens: 0 },
      new Date('2099-12-31T00:00:00.000Z'),
    );
    expect(getModelUsageReport(SESSION_A).get('claude-opus-5')!.costUsd).toBeCloseTo(
      getModelUsageReport(SESSION_B).get('claude-opus-5')!.costUsd,
      10,
    );
  });
});

// OpenAI began charging for prompt-cache WRITES with the GPT-5.6 family
// (1.25x the uncached input rate, automatic and explicit breakpoints alike).
// The catalog expresses that as a `cached_write` price, so billing keys off the
// declared price rather than the model name.
describe('OpenAI cache-write billing', () => {
  it('bills writes at the declared price for models that publish one', () => {
    // gpt-5.6-terra: input $2/M, cached_write $2.5/M. OpenAI prompt_tokens are
    // INCLUSIVE, so a 1M prompt that is entirely cache writes bills
    // 1M * $2.5/M = $2.50 — the input charge plus the 0.25x write surcharge.
    recordModelUsage(SESSION_A, 'gpt-5.6-terra', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('gpt-5.6-terra')!.costUsd).toBeCloseTo(2.5, 6);
  });

  it('keeps writes free for pre-5.6 OpenAI models that declare no write price', () => {
    // gpt-5.4-mini: input $0.75/M, no cached_write. A written token bills once,
    // at the input rate — identical to the same prompt with no cache activity.
    recordModelUsage(SESSION_A, 'gpt-5.4-mini', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 1_000_000,
    });
    recordModelUsage(SESSION_B, 'gpt-5.4-mini', {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const withWrites = getModelUsageReport(SESSION_A).get('gpt-5.4-mini')!.costUsd;
    expect(withWrites).toBeCloseTo(0.75, 6);
    expect(withWrites).toBeCloseTo(getModelUsageReport(SESSION_B).get('gpt-5.4-mini')!.costUsd, 10);
  });

  it('bills each prompt token exactly once across input, read, and write', () => {
    // gpt-5.6-terra: input $2/M, cached_input $0.2/M, cached_write $2.5/M.
    //   plain input (1M - 400k - 200k) 400k * 2   /1e6 = $0.80
    //   cache read                     400k * 0.2 /1e6 = $0.08
    //   cache write                    200k * 2.5 /1e6 = $0.50
    //   total = $1.38
    recordModelUsage(SESSION_A, 'gpt-5.6-terra', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 400_000,
      cacheCreationInputTokens: 200_000,
    });
    expect(getModelUsageReport(SESSION_A).get('gpt-5.6-terra')!.costUsd).toBeCloseTo(1.38, 6);
  });

  it('keeps Anthropic disjoint accounting: cache tokens add to input, never subtract', () => {
    // claude-opus-5: input $5/M, cached_input $0.5/M, cached_write $6.25/M.
    // Anthropic reports input_tokens SEPARATELY from the cache buckets, so all
    // three are summed — this is the accounting distinction that must survive
    // the OpenAI write-billing change.
    //   input       1M * 5    /1e6 = $5.00
    //   cache read  1M * 0.50 /1e6 = $0.50
    //   cache write 1M * 6.25 /1e6 = $6.25
    //   total = $11.75
    recordModelUsage(SESSION_A, 'claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(getModelUsageReport(SESSION_A).get('claude-opus-5')!.costUsd).toBeCloseTo(11.75, 6);
  });
});

describe('getSessionTotalCostUsd', () => {
  it('returns 0 for unknown session', () => {
    expect(getSessionTotalCostUsd('nonexistent')).toBe(0);
  });

  it('sums cost across all models in a session', () => {
    // claude-sonnet-5: $3/M input → 1M = $3
    recordModelUsage(
      SESSION_A,
      'claude-sonnet-5',
      { inputTokens: 1_000_000, outputTokens: 0 },
      PRICED_ON,
    );
    // gpt-5.6-sol: $5/M input → 1M = $5
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', { inputTokens: 1_000_000, outputTokens: 0 });

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
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', { inputTokens: 100, outputTokens: 50 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('gpt-5.6-sol')!;
    usage.inputTokens = 9999; // mutate snapshot

    // Store should be unaffected
    const report2 = getModelUsageReport(SESSION_A);
    expect(report2.get('gpt-5.6-sol')!.inputTokens).toBe(100);
  });
});

describe('resetModelUsage', () => {
  it('removes only the specified session', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });
    recordModelUsage(SESSION_B, 'gpt-5.6-sol', { inputTokens: 200, outputTokens: 100 });

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
    recordModelUsage(SESSION_B, 'gpt-5.6-sol', { inputTokens: 200, outputTokens: 100 });

    resetAllSessions();

    expect(getModelUsageReport(SESSION_A).size).toBe(0);
    expect(getModelUsageReport(SESSION_B).size).toBe(0);
  });
});

describe('reasoningOutputTokens', () => {
  it('accumulates reasoningOutputTokens across calls', () => {
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 200,
    });
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', {
      inputTokens: 100,
      outputTokens: 50,
      reasoningOutputTokens: 80,
    });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('gpt-5.6-sol')!;
    expect(usage.reasoningOutputTokens).toBe(280);
  });

  it('initializes reasoningOutputTokens to 0 when absent', () => {
    recordModelUsage(SESSION_A, 'claude-sonnet-5', { inputTokens: 100, outputTokens: 50 });

    const report = getModelUsageReport(SESSION_A);
    const usage = report.get('claude-sonnet-5')!;
    expect(usage.reasoningOutputTokens).toBe(0);
  });

  it('charges reasoning tokens at the output token rate', () => {
    // gpt-5.6-sol: outputCost=$30/M
    // 1M reasoning tokens = $30
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', {
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 1_000_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.6-sol')!.costUsd;
    expect(cost).toBeCloseTo(30.0, 4);
  });

  it('adds reasoning cost on top of input + output cost', () => {
    // gpt-5.6-sol: input=$5/M, output=$30/M
    // 1M input + 1M output + 500k reasoning = $5 + $30 + $15 = $50
    recordModelUsage(SESSION_A, 'gpt-5.6-sol', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningOutputTokens: 500_000,
    });

    const report = getModelUsageReport(SESSION_A);
    const cost = report.get('gpt-5.6-sol')!.costUsd;
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
    const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['gen_ai.system']).toBe('openai');
    expect(attrs['gen_ai.request.model']).toBe('gpt-5.6-sol');
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
    const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
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
    const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
      inputTokens: 1000,
      outputTokens: 500,
      reasoningOutputTokens: 256,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBe(256);
  });

  it('omits codex.usage.reasoning_output_tokens when absent', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(attrs['codex.usage.reasoning_output_tokens']).toBeUndefined();
  });

  it('computes total_tokens as input + output + reasoning + cache_creation', () => {
    const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
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

  // CPST Stage-0 mirror of the managed-usage ledger keys
  // (docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.2). The
  // tracker is in-memory and is explicitly NOT a CPST source; these attributes
  // only label the span with what the durable row already carries.
  describe('CPST vendor attributes', () => {
    it('emits no codex.usage CPST attribute when no CPST fields are supplied', () => {
      const attrs = toOtelAttributes('openai', 'gpt-5.6-sol', {
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
        'claude-sonnet-5',
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
        'gpt-5.6-sol',
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
        'gpt-5.6-sol',
        { inputTokens: 10, outputTokens: 5 },
        { fallbackUsed: false, retries: 0 },
      );

      expect(attrs['codex.usage.fallback_used']).toBe(false);
      expect(attrs['codex.usage.retries']).toBe(0);
    });

    it('leaves the token attributes byte-identical whether or not CPST is passed', () => {
      const usage = { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 300 };
      const withoutCpst = toOtelAttributes('openai', 'gpt-5.6-sol', usage);
      const withCpst = toOtelAttributes('openai', 'gpt-5.6-sol', usage, {
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
