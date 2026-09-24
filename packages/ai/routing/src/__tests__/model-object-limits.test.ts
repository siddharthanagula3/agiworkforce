import { modelRegistry } from '@agiworkforce/model-registry';
import { getModelMetadataById } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

interface RegistryLimits {
  contextTokens?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  knowledgeCutoff?: string;
}

const limits = (modelRegistry as unknown as { limits: Record<string, RegistryLimits> }).limits;
const modelKeys = Object.keys(limits).sort();

// Surfaces read the generated catalog: every limit the registry records must arrive there
// unchanged, and one it does not record must not be invented.
describe('the catalog model object carries the limits the registry records', () => {
  it('reads every registry model', () => {
    expect(modelKeys.length).toBeGreaterThan(0);
    expect(modelKeys.filter((key) => getModelMetadataById(key) === null)).toEqual([]);
  });

  it('exposes the training cutoff exactly where the registry records one', () => {
    const recorded = modelKeys.filter((key) => limits[key]?.knowledgeCutoff !== undefined);
    expect(recorded.length).toBeGreaterThan(0);
    for (const key of modelKeys) {
      expect(getModelMetadataById(key)?.knowledgeCutoff, key).toBe(limits[key]?.knowledgeCutoff);
    }
  });

  it('exposes the maximum output exactly where the registry records one', () => {
    for (const key of modelKeys) {
      const recorded = limits[key]?.maxOutputTokens;
      if (recorded === undefined) continue;
      expect(getModelMetadataById(key)?.maxOutputTokens, key).toBe(recorded);
    }
  });

  it('exposes the context window the registry records', () => {
    for (const key of modelKeys) {
      const recorded = limits[key]?.contextTokens;
      if (recorded === undefined) continue;
      expect(getModelMetadataById(key)?.contextWindow, key).toBe(recorded);
    }
  });
});
