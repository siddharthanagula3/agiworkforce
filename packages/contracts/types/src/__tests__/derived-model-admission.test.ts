import { describe, it, expect } from 'vitest';
import {
  CHAT_MODEL_TYPES,
  MODEL_PRICE_BAND_SCALE,
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  getMinimumRequiredTier,
  getModelPriceBand,
  isManagedTrafficPermitted,
  listCanonicalModels,
  listChatModels,
} from '../model-catalog';

const NAMED_TIERS = ['economy', 'pro_additions', 'flagship_additions'] as const;

const namedModelIds = new Set(NAMED_TIERS.flatMap((tier) => getAllowedModelsForTier(tier)));
const chatModels = listChatModels();
const unnamedChatModels = chatModels.filter((model) => !namedModelIds.has(model.id));
const derivable = unnamedChatModels.filter((model) => isManagedTrafficPermitted(model.id));
const byokOnly = unnamedChatModels.filter((model) => !isManagedTrafficPermitted(model.id));

let runningCeiling = 0;
const CEILINGS = new Map<string, number>(
  NAMED_TIERS.map((tier) => {
    for (const modelId of getAllowedModelsForTier(tier)) {
      const metadata = chatModels.find((model) => model.id === modelId);
      const price = metadata ? metadata.inputCost + metadata.outputCost : 0;
      if (price > runningCeiling) runningCeiling = price;
    }
    return [tier, runningCeiling];
  }),
);

function namedCeiling(tier: (typeof NAMED_TIERS)[number]): number {
  return CEILINGS.get(tier)!;
}

describe('derived model admission · the ceilings and the premium share are per dollar, not per model, so this rule changes which models can consume a budget and never how much', () => {
  it('leaves every model the allow list names on its list verdict', () => {
    for (const tier of NAMED_TIERS) {
      for (const modelId of getAllowedModelsForTier(tier)) {
        const expected =
          tier === 'flagship_additions' ? 'max' : tier === 'pro_additions' ? 'pro' : 'basic';
        expect(getMinimumRequiredTier(modelId)).toBe(expected);
      }
    }
  });

  it('admits an unnamed managed-eligible model at pro when only pro already covers its price', () => {
    const freeCeiling = namedCeiling('economy');
    const proCeiling = namedCeiling('pro_additions');
    const model = derivable.find((candidate) => {
      const price = candidate.inputCost + candidate.outputCost;
      return price > freeCeiling && price <= proCeiling;
    });
    expect(model).toBeDefined();
    expect(getMinimumRequiredTier(model!.id)).toBe('pro');
    expect(canAccessModelForSubscriptionTier(model!.id, 'free')).toBe(false);
    expect(canAccessModelForSubscriptionTier(model!.id, 'basic')).toBe(false);
    expect(canAccessModelForSubscriptionTier(model!.id, 'pro')).toBe(true);
    expect(canAccessModelForSubscriptionTier(model!.id, 'max')).toBe(true);
    expect(canAccessModelForSubscriptionTier(model!.id, 'enterprise')).toBe(true);
  });

  it('admits a byok-only model at no plan, so it can appear nowhere on web', () => {
    expect(byokOnly.length).toBeGreaterThan(0);
    for (const model of byokOnly) {
      expect(getMinimumRequiredTier(model.id)).toBeNull();
      for (const tier of ['free', 'basic', 'pro', 'max', 'enterprise']) {
        expect(canAccessModelForSubscriptionTier(model.id, tier)).toBe(false);
      }
    }
  });

  it('never derives a floor stricter than the plan the allow list already charges for that price', () => {
    for (const model of derivable) {
      const price = model.inputCost + model.outputCost;
      const derived = getMinimumRequiredTier(model.id);
      expect(derived).not.toBeNull();
      if (price <= namedCeiling('economy')) expect(derived).toBe('basic');
      else if (price <= namedCeiling('pro_additions')) expect(derived).toBe('pro');
      else expect(derived).toBe('max');
    }
  });

  it('bands only the models some plan admits, so a band cannot move with a plan', () => {
    for (const model of chatModels) {
      const banded = getModelPriceBand(model.id) !== null;
      expect(banded).toBe(getMinimumRequiredTier(model.id) !== null);
    }
  });

  it('bands every servable model inside the scale and orders the bands by price', () => {
    const banded = chatModels
      .filter((model) => getMinimumRequiredTier(model.id) !== null)
      .map((model) => ({
        band: getModelPriceBand(model.id),
        price: model.inputCost + model.outputCost,
      }))
      .filter(
        (entry): entry is { band: { filled: number; scale: number }; price: number } =>
          entry.band !== null,
      );
    expect(banded.length).toBeGreaterThan(0);
    for (const entry of banded) {
      expect(entry.band.scale).toBe(MODEL_PRICE_BAND_SCALE);
      expect(entry.band.filled).toBeGreaterThanOrEqual(1);
      expect(entry.band.filled).toBeLessThanOrEqual(MODEL_PRICE_BAND_SCALE);
    }
    const cheapest = banded.reduce((low, entry) => (entry.price < low.price ? entry : low));
    const dearest = banded.reduce((high, entry) => (entry.price > high.price ? entry : high));
    expect(cheapest.band.filled).toBeLessThanOrEqual(dearest.band.filled);
  });

  it('keeps a managed-eligible non-chat model out of the derivation', () => {
    const chatTypes = new Set<string>(CHAT_MODEL_TYPES);
    const chatIds = new Set(chatModels.map((model) => model.id));
    const nonChatManaged = listCanonicalModels().filter(
      (model) =>
        !chatIds.has(model.id) &&
        !chatTypes.has(model.modelType) &&
        !namedModelIds.has(model.id) &&
        isManagedTrafficPermitted(model.id),
    );
    expect(nonChatManaged.length).toBeGreaterThan(0);
    for (const model of nonChatManaged) {
      expect(getMinimumRequiredTier(model.id)).toBeNull();
      expect(canAccessModelForSubscriptionTier(model.id, 'max')).toBe(false);
    }
  });

  it('grows the web-servable roster to the named models plus the managed-eligible ones', () => {
    const servable = chatModels.filter((model) => getMinimumRequiredTier(model.id) !== null);
    expect(servable.length).toBe(namedModelIds.size + derivable.length);
    const admittedOnFree = servable.filter((model) =>
      canAccessModelForSubscriptionTier(model.id, 'free'),
    );
    expect(admittedOnFree.length).toBeGreaterThan(0);
    expect(admittedOnFree.length).toBeLessThan(servable.length);
  });
});
