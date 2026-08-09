import { describe, expect, it, vi } from 'vitest';

import { LLMCostCalculator } from '../llm-cost-calculator';

/**
 * Regression coverage for the founder-selected Sonnet 5 standard rates, the
 * dated-pricing mechanism, and cache-write billing.
 *
 * The catalog lookup is mocked only to ADD a synthetic scheduled model
 * (`fixture-scheduled-model`) used to prove the dated-window mechanism on
 * arbitrary dates. Every real model — Sonnet 5 included — still resolves
 * through the real catalog, so the founder pin below is a pin on shipped data.
 */
vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  /**
   * SYNTHETIC fixture. Its window dates are arbitrary and belong to no product
   * price: the mechanism must stay covered without a live promotional window to
   * lean on, and no shipped rate may be reachable by editing this fixture.
   */
  const fixture = {
    id: 'fixture-scheduled-model',
    provider: 'anthropic',
    inputCost: 3,
    outputCost: 15,
    cached_input: 0.3,
    cached_write: 3.75,
    cached_write_1h: 6,
    pricingSchedule: [
      {
        effectiveUntil: '2030-03-31',
        inputCost: 2,
        outputCost: 10,
        cached_input: 0.2,
        cached_write: 2.5,
        cached_write_1h: 4,
      },
      { effectiveFrom: '2030-04-01' },
    ],
  };
  return {
    ...actual,
    getModelMetadataById: (id: string) =>
      id === fixture.id ? fixture : actual.getModelMetadataById(id),
  };
});

const SONNET_5 = 'claude-sonnet-5';

/**
 * Founder pin — Decision #22 (docs/decisions/CURRENT_DECISIONS.md, reaffirmed
 * 2026-08-05). Sonnet 5 bills users the founder-selected standard $3/$15 per
 * MTok (cache read $0.30, 5m write $3.75, 1h write $6.00) on EVERY date.
 * Anthropic's introductory window is a provider-COST fact recorded in the
 * registry's verificationLog; it is never a product price. Every case pins a
 * fixed date on both sides of that retired 2026-08-31 boundary, so nothing here
 * moves with the calendar.
 */
describe('LLMCostCalculator — Sonnet 5 standard pricing (founder pin)', () => {
  const PIN_DATES = [
    new Date('2020-01-01T00:00:00.000Z'),
    new Date('2026-08-15T00:00:00.000Z'),
    new Date('2026-09-15T00:00:00.000Z'),
  ];

  it('does not apply date-dependent promotional pricing', () => {
    for (const date of PIN_DATES) {
      const pricing = LLMCostCalculator.getPricing('anthropic', SONNET_5, date);
      expect(pricing.inputCostPer1MTokens).toBe(3);
      expect(pricing.outputCostPer1MTokens).toBe(15);
      expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
      expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
      expect(pricing.cachedWrite1hCostPer1MTokens).toBe(6);
      // Field-by-field equality across dates, so a future window that moves any
      // single rate fails here too.
      expect(pricing).toEqual(LLMCostCalculator.getPricing('anthropic', SONNET_5, PIN_DATES[0]));
    }
  });

  it('bills a mixed input/output/cache-read/cache-write request identically on every date', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };

    // Standard: (1M*$3) + (1M*$15) + (1M*$0.3) + (1M*$3.75) = $22.05 → 2205 cents.
    for (const date of PIN_DATES) {
      expect(LLMCostCalculator.calculateCost('anthropic', SONNET_5, usage, date)).toBe(2205);
    }
  });

  it('bills the 1h cache-write tier at the standard $6/M on every date', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    };
    for (const date of PIN_DATES) {
      expect(LLMCostCalculator.calculateCost('anthropic', SONNET_5, usage, date)).toBe(600);
    }
  });

  it('estimateCost and getInputCostPerMtok use the same standard rate on every date', () => {
    for (const date of PIN_DATES) {
      expect(LLMCostCalculator.getInputCostPerMtok('anthropic', SONNET_5, date)).toBe(3);
      // 1M input tokens * $3/M = 300 cents.
      expect(LLMCostCalculator.estimateCost('anthropic', SONNET_5, 1_000_000, 0, date)).toBe(300);
    }
  });

  it('charges at least one ledger cent for non-empty paid usage while preserving free precision', () => {
    const usage = { promptTokens: 100, completionTokens: 0, totalTokens: 100 };
    const date = new Date('2026-09-15T00:00:00.000Z');

    expect(LLMCostCalculator.calculateCost('anthropic', SONNET_5, usage, date)).toBe(1);
    expect(LLMCostCalculator.calculateCostMicrousd('anthropic', SONNET_5, usage, date)).toBe(300);
  });

  it('does not charge a paid request with no observed usage', () => {
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        SONNET_5,
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        new Date('2026-09-15T00:00:00.000Z'),
      ),
    ).toBe(0);
  });
});

/**
 * The dated-pricing MECHANISM, proved against the synthetic fixture above so it
 * is covered whether or not any shipped model currently schedules a price.
 * `effectiveFrom`/`effectiveUntil` are UTC calendar days, inclusive; the
 * changeover happens at UTC midnight.
 */
describe('LLMCostCalculator — dated pricing mechanism (synthetic fixture)', () => {
  const SCHEDULED_MODEL = 'fixture-scheduled-model';
  const INSIDE_FIRST_WINDOW = new Date('2030-02-15T00:00:00.000Z');
  const LAST_DAY_OF_FIRST_WINDOW = new Date('2030-03-31T23:59:59.999Z');
  const FIRST_DAY_OF_SECOND_WINDOW = new Date('2030-04-01T00:00:00.000Z');

  it('uses the covering window for every rate field, not just input and output', () => {
    const pricing = LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, INSIDE_FIRST_WINDOW);
    expect(pricing.inputCostPer1MTokens).toBe(2);
    expect(pricing.outputCostPer1MTokens).toBe(10);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.2);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(2.5);
    expect(pricing.cachedWrite1hCostPer1MTokens).toBe(4);
  });

  it('treats effectiveUntil as inclusive and switches on the next UTC day', () => {
    expect(
      LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, LAST_DAY_OF_FIRST_WINDOW)
        .inputCostPer1MTokens,
    ).toBe(2);
    expect(
      LLMCostCalculator.getPricing('anthropic', SCHEDULED_MODEL, FIRST_DAY_OF_SECOND_WINDOW)
        .inputCostPer1MTokens,
    ).toBe(3);
  });

  it('falls back to the top-level rates for fields the covering window omits', () => {
    // The second window declares only its start date.
    const pricing = LLMCostCalculator.getPricing(
      'anthropic',
      SCHEDULED_MODEL,
      FIRST_DAY_OF_SECOND_WINDOW,
    );
    expect(pricing.outputCostPer1MTokens).toBe(15);
    expect(pricing.cachedInputCostPer1MTokens).toBe(0.3);
    expect(pricing.cachedWriteCostPer1MTokens).toBe(3.75);
    expect(pricing.cachedWrite1hCostPer1MTokens).toBe(6);
  });

  it('bills a mixed request at the rate window that covers the request date', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };

    // First window: (1M*$2) + (1M*$10) + (1M*$0.2) + (1M*$2.5) = $14.70.
    expect(
      LLMCostCalculator.calculateCost('anthropic', SCHEDULED_MODEL, usage, INSIDE_FIRST_WINDOW),
    ).toBe(1470);
    // Second window: (1M*$3) + (1M*$15) + (1M*$0.3) + (1M*$3.75) = $22.05.
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        SCHEDULED_MODEL,
        usage,
        FIRST_DAY_OF_SECOND_WINDOW,
      ),
    ).toBe(2205);
  });

  it('takes the 1h cache-write rate from the window, not from a fixed 2x multiplier', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheCreationInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    };

    // First window 1h write $4/M; second window inherits the standard $6/M.
    expect(
      LLMCostCalculator.calculateCost('anthropic', SCHEDULED_MODEL, usage, INSIDE_FIRST_WINDOW),
    ).toBe(400);
    expect(
      LLMCostCalculator.calculateCost(
        'anthropic',
        SCHEDULED_MODEL,
        usage,
        FIRST_DAY_OF_SECOND_WINDOW,
      ),
    ).toBe(600);
  });

  it('prices a model without a schedule identically on any date', () => {
    const early = LLMCostCalculator.getPricing(
      'anthropic',
      'claude-opus-5',
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const late = LLMCostCalculator.getPricing(
      'anthropic',
      'claude-opus-5',
      new Date('2099-12-31T00:00:00.000Z'),
    );
    expect(late).toEqual(early);
  });
});

/**
 * OpenAI began charging for prompt-cache WRITES with the GPT-5.6 family: 1.25x
 * the uncached input rate, on automatic and explicit breakpoints alike. The
 * catalog expresses that as a `cached_write` price, so billing keys off the
 * declared price rather than off the model name — and models that declare none
 * (every pre-5.6 OpenAI model) keep free writes.
 */
describe('LLMCostCalculator — cache-write billing', () => {
  const PRICED_ON = new Date('2026-09-01T00:00:00.000Z');

  it('reads the declared GPT-5.6 write price from the catalog', () => {
    expect(LLMCostCalculator.getCacheWriteCostPerMtok('openai', 'gpt-5.6-terra', PRICED_ON)).toBe(
      2.5,
    );
    expect(LLMCostCalculator.getCacheWriteCostPerMtok('openai', 'gpt-5.6-luna', PRICED_ON)).toBe(
      0.25,
    );
  });

  it('falls back to the plain input rate — a free write — when none is declared', () => {
    const pricing = LLMCostCalculator.getPricing('openai', 'gpt-5.4-mini', PRICED_ON);
    expect(pricing.cachedWriteCostPer1MTokens).toBeUndefined();
    expect(LLMCostCalculator.getCacheWriteCostPerMtok('openai', 'gpt-5.4-mini', PRICED_ON)).toBe(
      pricing.inputCostPer1MTokens,
    );
  });

  it('bills an inclusive-prompt OpenAI request once per token, writes at the declared rate', () => {
    // gpt-5.6-terra: input $2/M, cached_input $0.2/M, cached_write $2.5/M.
    // OpenAI prompt_tokens INCLUDE both cache buckets, so:
    //   plain input (1M - 400k - 200k) 400k * $2   = $0.80
    //   cache read                     400k * $0.2 = $0.08
    //   cache write                    200k * $2.5 = $0.50
    //   total = $1.38 → 138 cents
    const cents = LLMCostCalculator.calculateCost(
      'openai',
      'gpt-5.6-terra',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 400_000,
        cacheCreationInputTokens: 200_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(138);
  });

  it('adds nothing for a cache write on a pre-5.6 OpenAI model', () => {
    // gpt-5.4-mini: input $0.75/M and no declared write price, so a 1M prompt
    // that is entirely cache writes costs the same as one with no cache at all.
    const base = {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
    };
    const withWrites = LLMCostCalculator.calculateCost(
      'openai',
      'gpt-5.4-mini',
      { ...base, cacheCreationInputTokens: 1_000_000 },
      PRICED_ON,
    );
    const withoutWrites = LLMCostCalculator.calculateCost(
      'openai',
      'gpt-5.4-mini',
      base,
      PRICED_ON,
    );
    expect(withWrites).toBe(75);
    expect(withWrites).toBe(withoutWrites);
  });

  it('bills a cache READ at the full input rate when the catalog prices none', () => {
    // grok-4.5 publishes no cached_input. Billing a tenth of the input rate
    // would invent a discount the catalog does not publish and would
    // undercharge the same request the desktop calculator
    // (apps/desktop/src-tauri/src/core/llm/cost_calculator.rs) bills in full.
    // This is the reachable case: grok-4.5 is in
    // tierAllowedModels.flagship_additions and its xAI adapter reuses the
    // OpenAI stream translator, which reports cached prompt tokens.
    const pricing = LLMCostCalculator.getPricing('xai', 'grok-4.5', PRICED_ON);
    expect(typeof pricing.cachedInputCostPer1MTokens).not.toBe('number');

    // 1M prompt served entirely from cache: 1M * $2 = 200 cents, not 20.
    const cents = LLMCostCalculator.calculateCost(
      'xai',
      'grok-4.5',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(200);
  });

  it('keeps Anthropic disjoint accounting distinct from OpenAI subset accounting', () => {
    expect(
      LLMCostCalculator.getPricing('anthropic', 'claude-opus-5', PRICED_ON)
        .cacheTokensDisjointFromInput,
    ).toBe(true);
    expect(
      LLMCostCalculator.getPricing('openai', 'gpt-5.6-terra', PRICED_ON)
        .cacheTokensDisjointFromInput,
    ).toBe(false);

    // claude-opus-5: input $5/M, cache read $0.5/M, cache write $6.25/M. The
    // cache buckets are ADDITIONAL to promptTokens, so nothing is subtracted:
    // $5.00 + $0.50 + $6.25 = $11.75 → 1175 cents.
    const cents = LLMCostCalculator.calculateCost(
      'anthropic',
      'claude-opus-5',
      {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
        cacheCreationInputTokens: 1_000_000,
      },
      PRICED_ON,
    );
    expect(cents).toBe(1175);
  });
});
