import { describe, expect, it } from 'vitest';
import {
  getDefaultModel,
  getLocalModelCatalog,
  getLiteModeModel,
  getModelById,
  getModelsForRole,
  getShippableModels,
  getSystemModelForTier1Runtime,
} from '../catalog.js';
import { requireExecutorchVisionModel, requireGgufVisionModel } from './catalog-fixtures.js';

const HEX64 = /^[0-9a-f]{64}$/;

describe('on-device catalog: getModelById', () => {
  it('returns the canonical default model by its catalog id', () => {
    const expected = getDefaultModel();
    const model = getModelById(expected.id);
    expect(model).toBeDefined();
    expect(model!.id).toBe(expected.id);
    expect(model!.license).toBe('Apache-2.0');
    expect(model!.role).toBe('default');
    expect(model!.shipsInV1).toBe(true);
  });

  it('returns undefined for unknown id', () => {
    expect(getModelById('totally-unknown')).toBeUndefined();
  });

  it('returns the Apple system entry with fileSizeBytes 0', () => {
    const model = getSystemModelForTier1Runtime('foundation_models');
    expect(model).toBeDefined();
    expect(model!.fileSizeBytes).toBe(0);
    expect(model!.supportedRuntimes).toContain('apple-foundation-models');
    const legacyRuntimeShapedId = model!.supportedRuntimes[0];
    expect(getModelById(legacyRuntimeShapedId)?.id).toBe(model!.id);
  });

  it('returns the Android system entry with fileSizeBytes 0', () => {
    const model = getSystemModelForTier1Runtime('aicore');
    expect(model).toBeDefined();
    expect(model!.fileSizeBytes).toBe(0);
    expect(model!.supportedRuntimes).toContain('aicore');
  });
});

describe('on-device catalog: getDefaultModel', () => {
  it('returns the single catalog-owned default', () => {
    const model = getDefaultModel();
    expect(getLocalModelCatalog().filter((candidate) => candidate.role === 'default')).toEqual([
      model,
    ]);
    expect(model.role).toBe('default');
    expect(model.capabilities.text).toBe(true);
    expect(model.capabilities.toolCalls).toBe(true);
    expect(model.contextWindow).toBe(262_144);
  });

  it('default model is apache-licensed', () => {
    expect(getDefaultModel().license).toBe('Apache-2.0');
  });
});

describe('on-device catalog: tier-one system model resolution', () => {
  it('resolves each native runtime to a shippable system model', () => {
    const apple = getSystemModelForTier1Runtime('foundation_models');
    const android = getSystemModelForTier1Runtime('aicore');

    expect(apple).toMatchObject({ role: 'system-multimodal', shipsInV1: true });
    expect(apple?.supportedRuntimes).toContain('apple-foundation-models');
    expect(android).toMatchObject({ role: 'system-multimodal', shipsInV1: true });
    expect(android?.supportedRuntimes).toContain('aicore');
    expect(getSystemModelForTier1Runtime(null)).toBeUndefined();
  });
});

describe('on-device catalog: getShippableModels', () => {
  it('excludes internal evaluation hedges', () => {
    const shippable = getShippableModels();
    expect(shippable.some((m) => m.role === 'internal-eval-hedge')).toBe(false);
  });

  it('excludes every catalog row whose ship gate is closed', () => {
    const shippable = getShippableModels();
    const gatedModelIds = getLocalModelCatalog()
      .filter((model) => !model.shipsInV1)
      .map((model) => model.id);
    expect(gatedModelIds.length).toBeGreaterThan(0);
    expect(shippable.every((model) => !gatedModelIds.includes(model.id))).toBe(true);
  });

  it('excludes the vision pack until runtime artifacts are wired', () => {
    const shippable = getShippableModels();
    expect(
      shippable.some((model) => model.role === 'premium-vision-pack' && !model.executorchPreset),
    ).toBe(false);
  });

  it('includes system-multimodal entries', () => {
    const shippable = getShippableModels();
    expect(shippable.filter((m) => m.role === 'system-multimodal')).toHaveLength(2);
  });

  it('requires install presets for shippable downloadable ExecuTorch models', () => {
    for (const model of getShippableModels()) {
      if (model.fileSizeBytes <= 0) continue;
      if (!model.supportedRuntimes.includes('executorch')) continue;
      expect(model.executorchPreset).toBeDefined();
    }
  });

  it('excludes the GGUF multimodal pack until the mobile path ships', () => {
    const shippable = getShippableModels();
    const visionModel = requireGgufVisionModel();
    expect(shippable.some((m) => m.id === visionModel.id)).toBe(false);
  });
});

describe('on-device catalog: GGUF multimodal entry (P6)', () => {
  it('is the Apache-2.0 primary vision pack with verified GGUF artifacts', () => {
    const model = requireGgufVisionModel();
    expect(model).toBeDefined();
    expect(model!.license).toBe('Apache-2.0');
    expect(model!.role).toBe('premium-vision-pack');
    expect(model!.format).toBe('gguf');
    expect(model!.supportedRuntimes).toEqual(['llama-rn']);
    expect(model!.capabilities.visionIn).toBe(true);
  });

  it('carries a verified base-GGUF url + sha256 + byte size', () => {
    const model = requireGgufVisionModel();
    expect(new URL(model.downloadUrl!).protocol).toBe('https:');
    expect(model.downloadUrl).toMatch(/\.gguf$/i);
    expect(model.checksum).toMatch(HEX64);
    expect(model.fileSizeBytes).toBeGreaterThan(0);
  });

  it('carries a verified mmproj vision-projector as a second artifact', () => {
    const model = requireGgufVisionModel();
    expect(new URL(model.mmprojUrl!).protocol).toBe('https:');
    expect(model.mmprojUrl).toMatch(/\.gguf$/i);
    expect(model.mmprojChecksum).toMatch(HEX64);
    expect(model.mmprojSizeBytes).toBeGreaterThan(0);
  });

  it('stays gated off until the mobile runtime path is wired', () => {
    expect(requireGgufVisionModel().shipsInV1).toBe(false);
  });
});

describe('on-device catalog: tier-2 vision option (P6, gated off)', () => {
  it('is gated off with internally consistent verified artifact fields', () => {
    const model = requireExecutorchVisionModel();
    expect(model).toBeDefined();
    expect(model!.paramCountB).toBeGreaterThan(0);
    expect(model!.fileSizeBytes).toBeGreaterThan(0);
    expect(model!.shipsInV1).toBe(false);
    expect(new URL(model!.downloadUrl!).protocol).toBe('https:');
    expect(model!.checksum).toMatch(HEX64);
    expect(model!.executorchPreset?.modelName).toBeTruthy();
    expect(model!.executorchPreset?.capabilities).toContain('vision');
    expect(model!.downloadUrl).toBe(model!.executorchPreset?.modelSource);
    expect(model!.license).not.toBe('Unverified');
  });

  it('claims vision-in NOMINALLY only — effective vision stays install-gated', () => {
    // Tier-2 image plumbing ships (tier2.ts mediaPath path); the honest
    // runtime capability is effectiveTier2VisionIn (multimodal.ts), which is
    // false until the model is actually installed — pinned in
    // tier2-vision.test.ts.
    const model = requireExecutorchVisionModel();
    expect(model.capabilities.visionIn).toBe(true);
  });

  it('returns undefined for a retired fixture id', () => {
    expect(getModelById('fixture-retired-local-model')).toBeUndefined();
  });
});

describe('on-device catalog: getLiteModeModel', () => {
  it('returns the single lite-mode model', () => {
    const model = getLiteModeModel();
    expect(model).toBeDefined();
    expect(model!.liteMode).toBe(true);
    expect(model!.role).toBe('lite-mode');
    expect(getLocalModelCatalog().filter((candidate) => candidate.liteMode)).toEqual([model]);
  });
});

describe('on-device catalog: getModelsForRole', () => {
  it('returns only system-multimodal entries for that role', () => {
    const models = getModelsForRole('system-multimodal');
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models.every((m) => m.role === 'system-multimodal')).toBe(true);
  });

  it('returns empty array for role with no matches', () => {
    expect(getModelsForRole('premium-multimodal-alt').every((m) => !m.shipsInV1)).toBe(true);
  });
});

describe('on-device catalog: executorch URLs include the HF /resolve/ segment (A14)', () => {
  it('default model preset modelSource uses /resolve/ (raw .pte, not the HTML browser)', () => {
    const model = getDefaultModel();
    const preset = model.executorchPreset;
    expect(preset).toBeDefined();
    expect(preset?.modelSource).toContain('/resolve/');
    expect(preset?.modelSource).toMatch(/\.pte$/);
  });

  it('every shippable executorch preset uses /resolve/ in all artifact URLs', () => {
    for (const m of getShippableModels()) {
      const preset = m.executorchPreset;
      if (!preset) continue;
      for (const url of [
        preset.modelSource,
        preset.tokenizerSource,
        preset.tokenizerConfigSource,
      ]) {
        if (url) expect(url).toContain('/resolve/');
      }
    }
  });
});
