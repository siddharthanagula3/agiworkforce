import { describe, expect, it } from 'vitest';

import { listCanonicalModels } from '@agiworkforce/types';

import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';

/**
 * Production forensic, 2026-09-12. One "hi" on Max 15x billed $1.00.
 *
 * managed_usage_requests row 08820396-afa1-42e8-98a9-6a9215ad0d62 recorded the
 * true usage and the true cost, then settled five thousand times higher:
 *
 *   inputTokens 842, outputTokens 15
 *   providerCostDollars 0.0001864      (186.4 microUSD, correct)
 *   estimated_cost_microusd    9_844   (reservation, correct)
 *   actual_cost_microusd   1_000_000   ($1.00, wrong)
 *
 * `providerCostMicrousd` is priced on the SERVING route and was right.
 * `billedCostMicrousd` is priced on the LIST route via
 * `calculateListCostMicrousd`, and that is the number that reached the ledger.
 * These tests pin the list-price path to the same arithmetic the serving path
 * already gets, so the two can never diverge by orders of magnitude again.
 */
describe('LLMCostCalculator list price · production overbill regression', () => {
  // The subject is chosen by the published rate the expected figure below is
  // derived from, rather than by name: the arithmetic is what is under test, and
  // a literal id here would be a second copy of the catalogue. If no model
  // carries that rate any more, this fails loudly instead of drifting.
  const INPUT_PER_MILLION = 0.2;
  const OUTPUT_PER_MILLION = 1.2;
  const model = listCanonicalModels().find(
    (candidate) =>
      candidate.inputCost === INPUT_PER_MILLION && candidate.outputCost === OUTPUT_PER_MILLION,
  )?.id;
  const usage = {
    promptTokens: 842,
    completionTokens: 15,
    totalTokens: 857,
  };

  // 842 / 1e6 * $0.20 + 15 / 1e6 * $1.20 = $0.0001864
  const EXPECTED_MICROUSD = 187; // Math.ceil(0.0001864 * 1e6)

  it('guards the fixture: a model still carries the rate this pins', () => {
    expect(model).toBeDefined();
  });

  it('prices the exact production turn at its token cost, not a dollar', () => {
    const billed = LLMCostCalculator.calculateListCostMicrousd(model!, usage);

    expect(billed).not.toBeNull();
    expect(billed).toBeLessThan(1_000); // $0.001: anything near $1.00 is the bug
    expect(billed).toBe(EXPECTED_MICROUSD);
  });

  it('never bills a whole dollar for a sub-cent turn', () => {
    const billed = LLMCostCalculator.calculateListCostMicrousd(model!, usage) ?? 0;

    expect(billed).not.toBe(1_000_000);
  });

  it('agrees with the serving-route price for the same usage', () => {
    const list = LLMCostCalculator.listPriceRoute(model!);
    expect(list).not.toBeNull();

    const served = LLMCostCalculator.calculateCostMicrousd(
      'openai',
      model!,
      usage,
      undefined,
      `openai/${model}`,
    );
    const billed = LLMCostCalculator.calculateListCostMicrousd(model!, usage) ?? 0;

    // The customer rate and the COGS rate may differ by margin, never by 1000x.
    expect(billed).toBeGreaterThan(0);
    expect(served).toBeGreaterThan(0);
    expect(billed / served).toBeLessThan(10);
  });

  it('scales linearly with tokens rather than snapping to a floor', () => {
    const single = LLMCostCalculator.calculateListCostMicrousd(model!, usage) ?? 0;
    const tenfold =
      LLMCostCalculator.calculateListCostMicrousd(model!, {
        promptTokens: usage.promptTokens * 10,
        completionTokens: usage.completionTokens * 10,
        totalTokens: usage.totalTokens * 10,
      }) ?? 0;

    // A per-request floor would make these equal; real pricing is ~10x apart.
    expect(tenfold).toBeGreaterThan(single * 8);
  });
});
