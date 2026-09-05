import { describe, it, expect } from 'vitest';
import {
  MODEL_FAMILY_REGISTRY,
  PLAN_LABEL,
  getDefaultAutoRoutingProfile,
  getMinimumRequiredTier,
  getModelMetadataById,
  listCanonicalModels,
} from '@agiworkforce/types';
import {
  MODEL_PICKER_FAVOURITES_LIMIT,
  MODEL_PICKER_GUIDANCE,
  MODEL_PICKER_PRICE_BAND_SCALE,
  MODEL_PICKER_RECOMMENDED_LIMIT,
  buildModelPickerShortList,
  getModelPriceBand,
  resolveModelPriceBands,
  resolvePlanLockLabel,
  type ModelPickerShortListInput,
  type ModelPickerSourceModel,
} from '../modelPicker';

const AUTO_GUIDANCE = 'auto guidance fixture';
const autoContinuityGuidance = (displayName: string) => `stays on ${displayName}`;

function toSource(modelId: string): ModelPickerSourceModel {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) throw new Error(`registry has no entry for ${modelId}`);
  return {
    id: metadata.id,
    displayName: metadata.name,
    providerKey: metadata.provider,
  };
}

const familyActiveIds = Object.values(MODEL_FAMILY_REGISTRY).map((family) => family.activeModelId);
const familySources = familyActiveIds
  .filter((modelId) => getModelMetadataById(modelId) !== null)
  .map(toSource);

const autoSource: ModelPickerSourceModel = {
  id: getDefaultAutoRoutingProfile().id,
  displayName: getDefaultAutoRoutingProfile().label,
  providerKey: 'managed_cloud',
};

function build(overrides: Partial<ModelPickerShortListInput> = {}) {
  return buildModelPickerShortList({
    models: [autoSource, ...familySources],
    planTier: 'max',
    favouriteModelIds: [],
    conversationModelId: null,
    admitsModel: () => true,
    autoGuidance: AUTO_GUIDANCE,
    autoContinuityGuidance,
    ...overrides,
  });
}

describe('buildModelPickerShortList', () => {
  it('puts Auto first with the registry label and the caller copy', () => {
    const shortList = build();
    expect(shortList.auto).not.toBeNull();
    expect(shortList.auto!.id).toBe(getDefaultAutoRoutingProfile().id);
    expect(shortList.auto!.label).toBe(getDefaultAutoRoutingProfile().label);
    expect(shortList.auto!.guidance).toBe(AUTO_GUIDANCE);
    expect(shortList.auto!.continuity).toBeNull();
  });

  it('names the conversation model in the Auto continuity line once one is pinned', () => {
    const pinned = familySources[0]!;
    const shortList = build({ conversationModelId: pinned.id });
    expect(shortList.auto!.continuity).toBe(autoContinuityGuidance(pinned.displayName));
  });

  it('keeps the Auto profile out of the selectable count and the recommended rows', () => {
    const shortList = build();
    expect(shortList.totalCount).toBe(familySources.length);
    expect(shortList.recommended.map((row) => row.id)).not.toContain(autoSource.id);
  });

  it('caps recommended at the stated limit and never repeats a family', () => {
    const shortList = build();
    expect(shortList.recommended.length).toBeLessThanOrEqual(MODEL_PICKER_RECOMMENDED_LIMIT);
    const slots = shortList.recommended.map((row) => row.familySlot ?? row.id);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('orders recommended differently for a plan that reaches a different profile', () => {
    const free = build({ planTier: 'free' }).recommended.map((row) => row.id);
    const max = build({ planTier: 'max' }).recommended.map((row) => row.id);
    expect(free.length).toBeGreaterThan(0);
    expect(max.length).toBeGreaterThan(0);
    expect(free).not.toEqual(max);
  });

  it('leaves recommended non-empty when no admitted model holds a family slot', () => {
    const [nonFamily] = listCanonicalModels().filter(
      (model) => !familyActiveIds.includes(model.id) && model.name.length > 0,
    );
    expect(nonFamily).toBeDefined();
    const shortList = build({ models: [autoSource, toSource(nonFamily!.id)] });
    expect(shortList.recommended.map((row) => row.id)).toEqual([nonFamily!.id]);
  });

  it('locks a row the plan does not admit with the plan name the catalog names', () => {
    const gated = familySources.find((model) => getMinimumRequiredTier(model.id) !== null);
    expect(gated).toBeDefined();
    const shortList = build({ admitsModel: (modelId) => modelId !== gated!.id });
    const row = shortList.rowsById.get(gated!.id);
    expect(row?.lock).toEqual({
      kind: 'plan',
      label: PLAN_LABEL[getMinimumRequiredTier(gated!.id)!],
    });
    expect(shortList.plan.admitsEveryModel).toBe(false);
    expect(shortList.recommended.map((r) => r.id)).not.toContain(gated!.id);
  });

  it('lets a caller override a lock, so a surface owns its own entitlement copy', () => {
    const target = familySources[0]!;
    const override = { kind: 'unavailable' as const, label: 'override fixture' };
    const shortList = build({
      admitsModel: () => false,
      lockOverrides: new Map([[target.id, override]]),
    });
    expect(shortList.rowsById.get(target.id)?.lock).toEqual(override);
  });

  it('reports the plan label and whether every model is admitted', () => {
    expect(build({ planTier: 'free' }).plan.label).toBe(PLAN_LABEL.free);
    expect(build().plan.admitsEveryModel).toBe(true);
  });

  it('shows at most the favourites limit and counts the overflow', () => {
    const favourites = familySources.slice(0, MODEL_PICKER_FAVOURITES_LIMIT + 2);
    expect(favourites.length).toBeGreaterThan(MODEL_PICKER_FAVOURITES_LIMIT);
    const shortList = build({ favouriteModelIds: favourites.map((model) => model.id) });
    expect(shortList.favourites).toHaveLength(MODEL_PICKER_FAVOURITES_LIMIT);
    expect(shortList.favouritesOverflow).toBe(favourites.length - MODEL_PICKER_FAVOURITES_LIMIT);
    for (const row of shortList.favourites) expect(row.isFavourite).toBe(true);
  });

  it('drops a model no plan admits from both layers rather than labelling it', () => {
    const unlockable = listCanonicalModels().find(
      (model) => getMinimumRequiredTier(model.id) === null,
    );
    expect(unlockable).toBeDefined();
    const shortList = build({
      models: [autoSource, ...familySources, toSource(unlockable!.id)],
      admitsModel: (modelId) => modelId !== unlockable!.id,
    });
    expect(shortList.rowsById.has(unlockable!.id)).toBe(false);
    expect(shortList.recommended.map((row) => row.id)).not.toContain(unlockable!.id);
    expect(shortList.totalCount).toBe(familySources.length);
  });

  it('takes the guidance line from the profile copy object, never the catalog description', () => {
    const phrases = new Set<string>(Object.values(MODEL_PICKER_GUIDANCE));
    for (const row of build().rowsById.values()) {
      expect(phrases.has(row.guidance)).toBe(true);
      expect(row.guidance).not.toBe(getModelMetadataById(row.id)!.bestFor.join(' · '));
    }
  });

  it('bands a model the same way whatever roster or plan it is asked about', () => {
    const target = familySources[0]!;
    const wide = build().rowsById.get(target.id)!.priceBand;
    const narrow = build({ models: [autoSource, target], planTier: 'free' }).rowsById.get(
      target.id,
    )!.priceBand;
    expect(narrow).toEqual(wide);
    expect(wide).toEqual(getModelPriceBand(target.id));
  });

  it('reads capability glyphs off the registry entry', () => {
    const shortList = build();
    for (const row of shortList.recommended) {
      const capabilities = getModelMetadataById(row.id)!.capabilities;
      for (const key of row.capabilityKeys) expect(capabilities[key]).toBe(true);
    }
  });
});

describe('resolveModelPriceBands', () => {
  it('stays inside the scale and puts the cheapest model below the dearest', () => {
    const ids = familySources.map((model) => model.id);
    const bands = resolveModelPriceBands(ids);
    expect(bands.size).toBeGreaterThan(0);
    for (const band of bands.values()) {
      expect(band.scale).toBe(MODEL_PICKER_PRICE_BAND_SCALE);
      expect(band.filled).toBeGreaterThanOrEqual(1);
      expect(band.filled).toBeLessThanOrEqual(MODEL_PICKER_PRICE_BAND_SCALE);
    }
    const priced = ids
      .map((id) => ({
        id,
        cost: getModelMetadataById(id)!.inputCost + getModelMetadataById(id)!.outputCost,
      }))
      .sort((left, right) => left.cost - right.cost);
    const cheapest = priced[0]!;
    const dearest = priced[priced.length - 1]!;
    expect(bands.get(cheapest.id)!.filled).toBeLessThanOrEqual(bands.get(dearest.id)!.filled);
  });

  it('gives models of equal price the same band', () => {
    const byCost = new Map<number, string[]>();
    for (const model of listCanonicalModels()) {
      const cost = model.inputCost + model.outputCost;
      byCost.set(cost, [...(byCost.get(cost) ?? []), model.id]);
    }
    const shared = [...byCost.values()].find((ids) => ids.length > 1);
    expect(shared).toBeDefined();
    const bands = resolveModelPriceBands(listCanonicalModels().map((model) => model.id));
    const filled = shared!.map((id) => bands.get(id)!.filled);
    expect(new Set(filled).size).toBe(1);
  });
});

describe('resolvePlanLockLabel', () => {
  it('answers with a plan name from the billing catalog for a gated model', () => {
    const gated = listCanonicalModels().find((model) => getMinimumRequiredTier(model.id) !== null);
    expect(gated).toBeDefined();
    expect(resolvePlanLockLabel(gated!.id)).toBe(PLAN_LABEL[getMinimumRequiredTier(gated!.id)!]);
  });

  it('answers null for a model no plan tier names', () => {
    expect(resolvePlanLockLabel('')).toBeNull();
  });
});
