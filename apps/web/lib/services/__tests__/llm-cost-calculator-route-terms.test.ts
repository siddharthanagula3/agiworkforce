import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import { LLMCostCalculator } from '../llm-cost-calculator';

interface RegistryRouteTier {
  thresholdTokens: number;
  thresholdBoundary?: 'inclusive' | 'exclusive';
  inputPerMillion: number;
  outputPerMillion: number;
}

interface RegistryRoutePricing {
  inputPerMillion?: number;
  outputPerMillion?: number;
  cacheReadPerMillion?: number;
  promoExpiresAt?: string;
  postPromoPrices?: { input?: number; output?: number; cached_input?: number };
  inputTokenPricingTiers?: RegistryRouteTier[];
}

interface RegistryRoute {
  modelKey: string;
  provider: string;
  pricing: RegistryRoutePricing;
}

const ROUTES = Object.entries(modelRegistry.routes as unknown as Record<string, RegistryRoute>);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const promoRoutes = ROUTES.filter(
  ([, route]) =>
    route.pricing.promoExpiresAt !== undefined &&
    route.pricing.postPromoPrices?.input !== undefined &&
    route.pricing.postPromoPrices.output !== undefined,
);

const tieredRoutes = ROUTES.filter(
  ([, route]) =>
    (route.pricing.inputTokenPricingTiers?.length ?? 0) > 0 &&
    route.pricing.inputPerMillion !== undefined,
);

describe('LLMCostCalculator, route sheets that change price', () => {
  it('finds the routes these cases cover in the live registry', () => {
    expect(promoRoutes.length).toBeGreaterThan(0);
    expect(tieredRoutes.length).toBeGreaterThan(0);
  });

  it.each(promoRoutes)(
    '%s switches to its post-promotion price once the promotion ends',
    (routeId, route) => {
      const endsAt = Date.parse(route.pricing.promoExpiresAt!);
      const during = LLMCostCalculator.getPricing(
        route.provider,
        route.modelKey,
        new Date(endsAt - MS_PER_DAY),
        0,
        routeId,
      );
      const after = LLMCostCalculator.getPricing(
        route.provider,
        route.modelKey,
        new Date(endsAt),
        0,
        routeId,
      );

      expect(during.inputCostPer1MTokens).toBe(route.pricing.inputPerMillion);
      expect(during.outputCostPer1MTokens).toBe(route.pricing.outputPerMillion);
      expect(after.inputCostPer1MTokens).toBe(route.pricing.postPromoPrices!.input);
      expect(after.outputCostPer1MTokens).toBe(route.pricing.postPromoPrices!.output);
      if (route.pricing.postPromoPrices!.cached_input !== undefined) {
        expect(after.cachedInputCostPer1MTokens).toBe(route.pricing.postPromoPrices!.cached_input);
      }
    },
  );

  it.each(promoRoutes)(
    '%s bills a turn after the promotion at the post-promotion rate',
    (routeId, route) => {
      const endsAt = Date.parse(route.pricing.promoExpiresAt!);
      const usage = {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      };
      const microusd = LLMCostCalculator.calculateCostMicrousd(
        route.provider,
        route.modelKey,
        usage,
        new Date(endsAt + MS_PER_DAY),
        routeId,
      );
      const expected =
        (route.pricing.postPromoPrices!.input! + route.pricing.postPromoPrices!.output!) *
        1_000_000;
      expect(microusd).toBe(Math.ceil(expected));
    },
  );

  it.each(tieredRoutes)(
    '%s prices a prompt above its first threshold at the long-context tier',
    (routeId, route) => {
      const tier = [...route.pricing.inputTokenPricingTiers!].sort(
        (left, right) => left.thresholdTokens - right.thresholdTokens,
      )[0]!;
      const above = tier.thresholdTokens + 1;
      const below = Math.max(0, tier.thresholdTokens - 1);
      const now = new Date();

      const short = LLMCostCalculator.getPricing(
        route.provider,
        route.modelKey,
        now,
        below,
        routeId,
      );
      const long = LLMCostCalculator.getPricing(
        route.provider,
        route.modelKey,
        now,
        above,
        routeId,
      );

      expect(long.inputCostPer1MTokens).toBe(tier.inputPerMillion);
      expect(long.outputCostPer1MTokens).toBe(tier.outputPerMillion);
      if (route.pricing.promoExpiresAt === undefined) {
        expect(short.inputCostPer1MTokens).toBe(route.pricing.inputPerMillion);
      }
    },
  );
});
