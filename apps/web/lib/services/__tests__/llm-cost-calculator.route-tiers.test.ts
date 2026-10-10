import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import { LLMCostCalculator } from '../llm-cost-calculator';

interface RouteTier {
  thresholdTokens: number;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
}

interface TieredRoute {
  modelKey: string;
  provider: string;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    inputTokenPricingTiers?: RouteTier[];
  };
}

const PROMPT_TOKENS = 150_000;
const COMPLETION_TOKENS = 2_000;
const MICROUSD_PER_USD = 1_000_000;
const TOKENS_PER_MILLION = 1_000_000;

const routes = modelRegistry.routes as unknown as Record<string, TieredRoute>;

function tierCrossedAt(route: TieredRoute, promptTokens: number): RouteTier | undefined {
  return [...(route.pricing.inputTokenPricingTiers ?? [])]
    .filter((tier) => promptTokens > tier.thresholdTokens)
    .sort((a, b) => b.thresholdTokens - a.thresholdTokens)[0];
}

const anthropicRoutesTieredBelowPrompt = Object.entries(routes).filter(
  ([, route]) =>
    route.provider === 'anthropic' && tierCrossedAt(route, PROMPT_TOKENS) !== undefined,
);

function expectedMicrousd(tier: RouteTier, usage: { prompt: number; completion: number }): number {
  return Math.ceil(
    ((usage.prompt * tier.inputPerMillion + usage.completion * tier.outputPerMillion) /
      TOKENS_PER_MILLION) *
      MICROUSD_PER_USD,
  );
}

describe('settlement prices a long prompt at its input-length tier on the served route', () => {
  it('finds the Anthropic routes whose long-prompt tier starts under 150K tokens', () => {
    expect(anthropicRoutesTieredBelowPrompt.length).toBeGreaterThan(0);
  });

  it.each(anthropicRoutesTieredBelowPrompt)(
    'a 150K-token request on %s bills the whole request at the tier rate',
    (routeId, route) => {
      const tier = tierCrossedAt(route, PROMPT_TOKENS)!;
      const usage = {
        promptTokens: PROMPT_TOKENS,
        completionTokens: COMPLETION_TOKENS,
        totalTokens: PROMPT_TOKENS + COMPLETION_TOKENS,
      };
      const expected = expectedMicrousd(tier, {
        prompt: PROMPT_TOKENS,
        completion: COMPLETION_TOKENS,
      });

      expect(
        LLMCostCalculator.calculateCostMicrousd(
          route.provider,
          route.modelKey,
          usage,
          undefined,
          routeId,
        ),
      ).toBe(expected);
      expect(LLMCostCalculator.calculateListCostMicrousd(route.modelKey, usage)).toBe(expected);
      expect(
        LLMCostCalculator.estimateListCostMicrousd(
          route.modelKey,
          PROMPT_TOKENS,
          COMPLETION_TOKENS,
        ),
      ).toBe(expected);
    },
  );

  it.each(anthropicRoutesTieredBelowPrompt)(
    'cache reads on %s count toward the prompt length that selects the tier',
    (routeId, route) => {
      const tier = tierCrossedAt(route, PROMPT_TOKENS)!;
      const uncached = tier.thresholdTokens / 2;
      const cacheRead = PROMPT_TOKENS - uncached;
      const cost = LLMCostCalculator.calculateCostMicrousd(
        route.provider,
        route.modelKey,
        {
          promptTokens: uncached,
          completionTokens: COMPLETION_TOKENS,
          totalTokens: uncached + COMPLETION_TOKENS,
          cacheReadInputTokens: cacheRead,
        },
        undefined,
        routeId,
      );
      const tierInput = (uncached * tier.inputPerMillion) / TOKENS_PER_MILLION;
      const tierOutput = (COMPLETION_TOKENS * tier.outputPerMillion) / TOKENS_PER_MILLION;
      const tierCacheRead = ((tier.cacheReadPerMillion ?? 0) * cacheRead) / TOKENS_PER_MILLION;

      expect(cost).toBe(Math.ceil((tierInput + tierOutput + tierCacheRead) * MICROUSD_PER_USD));
    },
  );
});
