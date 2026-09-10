import { describe, expect, it } from 'vitest';

import { requireProviderDefaultModel } from '@agiworkforce/types';

import { LLMCostCalculator, isReasoningTokensDisjointFromOutput } from '../llm-cost-calculator';

const GOOGLE = 'google';
const ANTHROPIC = 'anthropic';
const OPENAI = 'openai';

const PROMPT_TOKENS = 1_000;
const COMPLETION_TOKENS = 2_000;
const REASONING_TOKENS = 5_000;

function usage(reasoningTokens?: number) {
  return {
    promptTokens: PROMPT_TOKENS,
    completionTokens: COMPLETION_TOKENS,
    totalTokens: PROMPT_TOKENS + COMPLETION_TOKENS,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}

describe('reasoning-token billing class', () => {
  it('marks google as reporting thinking tokens outside its output count', () => {
    expect(isReasoningTokensDisjointFromOutput(GOOGLE)).toBe(true);
  });

  it('leaves providers that fold reasoning into output alone', () => {
    expect(isReasoningTokensDisjointFromOutput(ANTHROPIC)).toBe(false);
    expect(isReasoningTokensDisjointFromOutput(OPENAI)).toBe(false);
    expect(isReasoningTokensDisjointFromOutput(null)).toBe(false);
  });
});

describe('LLMCostCalculator reasoning tokens', () => {
  it('bills google thinking tokens at the output rate on top of the reported output', () => {
    const model = requireProviderDefaultModel(GOOGLE);
    const outputRate = LLMCostCalculator.getPricing(GOOGLE, model).outputCostPer1MTokens;
    expect(outputRate).toBeGreaterThan(0);

    const withThoughts = LLMCostCalculator.calculateCostDollars(
      GOOGLE,
      model,
      usage(REASONING_TOKENS),
    );
    const withoutThoughts = LLMCostCalculator.calculateCostDollars(GOOGLE, model, usage());

    expect(withThoughts - withoutThoughts).toBeCloseTo(
      (REASONING_TOKENS / 1_000_000) * outputRate,
      10,
    );
  });

  it('does not double-bill anthropic reasoning tokens already inside its output count', () => {
    const model = requireProviderDefaultModel(ANTHROPIC);
    const withReasoning = LLMCostCalculator.calculateCostDollars(
      ANTHROPIC,
      model,
      usage(REASONING_TOKENS),
    );
    const withoutReasoning = LLMCostCalculator.calculateCostDollars(ANTHROPIC, model, usage());

    expect(withReasoning).toBe(withoutReasoning);
  });

  it('ignores a negative or absent reasoning count', () => {
    const model = requireProviderDefaultModel(GOOGLE);
    expect(LLMCostCalculator.calculateCostDollars(GOOGLE, model, usage(-100))).toBe(
      LLMCostCalculator.calculateCostDollars(GOOGLE, model, usage()),
    );
  });
});
