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
    'fixture-anthropic-standard': {
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
    // This inclusive-accounting fixture declares a cache-WRITE price at 1.25x input.
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
    // Synthetic OpenAI fixture with no write price declared.
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
    // A model that publishes no cache-read price takes the shared fallback.
    // The fixture deliberately reports cache tokens without declaring caching,
    // proving that the fallback keys on missing pricing rather than capability.
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
    // fixture-anthropic-standard: $3/M input, $15/M output on every date.
    // 1M input + 1M output = $3 + $15 = $18
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
    // fixture-anthropic-premium: inputCost=$5, cached_input=$0.5
    // 1M input + 1M cache_read = $5 + $0.5 = $5.5
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
    // fixture-inclusive-discounted-cache: input=$0.14/M, cached_input=$0.0028/M. DeepSeek reports
    // prompt_tokens INCLUSIVE of cache hits, so a 1M prompt with 1M cache hits is
    // entirely cached. Correct cost = 1M * $0.0028 = $0.0028, NOT
    // 1M*$0.14 + 1M*$0.0028 (the old double-count bug = $0.1428).
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
    // Above the catalog threshold the long rates are input=$4/M and cache
    // read=$0.4/M. 600k plain + 400k cached = $2.40 + $0.16 = $2.56.
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
    // fixture-inclusive-unpriced-cache prices no cache read, so its reads bill at the full $2/M — the
    // rate the desktop calculator and the gateway charge for the same request.
    // A 90%-off fallback here would bill $0.20/M for a discount the catalog
    // does not publish.
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
    // fixture-anthropic-standard: catalog cacheCreation = $3.75/M
    // 1M cache_creation = $3.75
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
    // fixture-anthropic-standard: input=$3/M, output=$15/M, cache-read=$0.3/M,
    // cache-write=$3.75/M.
    //   input      100k * 3    /1e6 = $0.30   (Anthropic input_tokens are disjoint → full, no subtraction)
    //   output      50k * 15   /1e6 = $0.75
    //   cache-read 200k * 0.30 /1e6 = $0.06
    //   cache-write800k * 3.75 /1e6 = $3.00
    //   total = $4.11
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
    // fixture-anthropic-premium: input=$5/M, output=$25/M, cache-read=$0.5/M,
    // cache-write=$6.25/M.
    //   input       1M * 5    /1e6 = $5.00
    //   output      1M * 25   /1e6 = $25.00
    //   cache-read  1M * 0.50 /1e6 = $0.50
    //   cache-write 1M * 6.25 /1e6 = $6.25
    //   total = $36.75
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
    // fixture-anthropic-standard: 5m cache-write=$3.75/M, 1h cache-write=$6/M.
    //   1h write 400k * (3 * 2.0  = $6.00/M) /1e6 = $2.40
    //   5m write 600k * (3 * 1.25 = $3.75/M) /1e6 = $2.25   (1M total − 400k @ 1h)
    //   total = $4.65
    // Exercises the 2x 1h premium explicitly — the other examples leave
    // cacheCreation1hInputTokens at 0, so only this case can fail on that rate.
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
    // This request is above the long-context threshold: input=$10/M,
    // output=$45/M, and cache read=$1/M.
    // OpenAI prompt_tokens INCLUDE the cached hits, so the cached subset is
    // subtracted from the billable-input bucket (billed once, at the read rate).
    //   billable input (1M - 400k) 600k * 10 /1e6 = $6.00
    //   cache-read                 400k * 1  /1e6 = $0.40
    //   output                      1M  * 45 /1e6 = $45.00
    //   total = $51.40
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
    // fixture-inclusive-discounted-cache: input=$0.14/M, output=$0.28/M, catalog cached_input=$0.0028/M.
    //   billable input (1M - 1M)   0 * 0.14   /1e6 = $0.00
    //   cache-read                1M * 0.0028 /1e6 = $0.0028
    //   output                   500k * 0.28  /1e6 = $0.14
    //   total = $0.1428
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

// Some OpenAI models charge for prompt-cache writes at 1.25x uncached input.
// The catalog expresses that as `cached_write`, so billing keys off declared
// pricing rather than a concrete model family or release name.
describe('OpenAI cache-write billing', () => {
  it('bills writes at the declared price for models that publish one', () => {
    // Above the threshold, a 1M prompt consisting entirely of cache writes uses
    // the catalog's $5/M long-context write rate.
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
    // Long-context rates are input $4/M, cache read $0.4/M, cache write $5/M.
    //   plain input (1M - 400k - 200k) 400k * 4   /1e6 = $1.60
    //   cache read                     400k * 0.4 /1e6 = $0.16
    //   cache write                    200k * 5   /1e6 = $1.00
    //   total = $2.76
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
    // fixture-anthropic-premium: input $5/M, cached_input $0.5/M, cached_write $6.25/M.
    // Anthropic reports input_tokens SEPARATELY from the cache buckets, so all
    // three are summed — this is the accounting distinction that must survive
    // the OpenAI write-billing change.
    //   input       1M * 5    /1e6 = $5.00
    //   cache read  1M * 0.50 /1e6 = $0.50
    //   cache write 1M * 6.25 /1e6 = $6.25
    //   total = $11.75
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
    // fixture-anthropic-standard: $3/M input → 1M = $3
    recordModelUsage(
      SESSION_A,
      'fixture-anthropic-standard',
      { inputTokens: 1_000_000, outputTokens: 0 },
      PRICED_ON,
    );
    // The 1M input crosses the long-context tier: $10/M → $10.
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
    usage.inputTokens = 9999; // mutate snapshot

    // Store should be unaffected
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
    // fixture-inclusive-tiered-primary: outputCost=$30/M
    // 1M reasoning tokens = $30
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
    // Above the threshold: input=$10/M, output/reasoning=$45/M.
    // 1M input + 1M output + 500k reasoning = $10 + $45 + $22.50 = $77.50.
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

    // total = 1000 + 500 + 200 + 300 = 2000
    expect(attrs['codex.usage.total_tokens']).toBe(2000);
  });

  it('total_tokens excludes cache_read (reads are not net-new tokens)', () => {
    const attrs = toOtelAttributes('anthropic', 'fixture-anthropic-standard', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 800, // not counted in total
    });

    // total = 1000 + 500 = 1500 (cache reads excluded)
    expect(attrs['codex.usage.total_tokens']).toBe(1500);
  });

  it('uses inferGenAiSystem to map provider to gen_ai.system', () => {
    const attrs = toOtelAttributes('google', 'fixture-model', {
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
