import { describe, expect, it } from 'vitest';
import { isModelLive, modelsCatalog, type ModelMetadata } from '../model-catalog';

function byResolutionPricedVideoModels(): ModelMetadata[] {
  return Object.values(modelsCatalog.models).filter(
    (model) =>
      model.modelType === 'video' &&
      isModelLive(model) &&
      Object.keys(model.videoPerSecondCostByResolution ?? {}).length > 0 &&
      model.videoGeneration?.pricing === undefined,
  );
}

describe('per-resolution video pricing coverage', () => {
  it('prices every resolution the model offers as an output size', () => {
    const models = byResolutionPricedVideoModels();
    expect(models.length).toBeGreaterThan(0);

    const unpriced = models.flatMap((model) => {
      const prices = model.videoPerSecondCostByResolution ?? {};
      const offered = new Set(
        (model.videoGeneration?.outputSizes ?? []).map((size) => size.resolution),
      );
      return [...offered]
        .filter((resolution) => prices[resolution as keyof typeof prices] === undefined)
        .map((resolution) => `${model.id}:${resolution}`);
    });

    expect(unpriced).toEqual([]);
  });

  it('keeps the flat rate at or below every per-resolution rate it stands in for', () => {
    for (const model of byResolutionPricedVideoModels()) {
      const flat = model.videoPerSecondCost;
      if (flat === undefined) continue;
      const rates = Object.values(model.videoPerSecondCostByResolution ?? {});
      expect(Math.min(...rates)).toBeGreaterThanOrEqual(flat);
    }
  });
});
