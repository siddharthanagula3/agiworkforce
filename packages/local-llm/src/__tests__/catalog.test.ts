import { describe, expect, it } from 'vitest';
import {
  getDefaultModel,
  getLiteModeModel,
  getModelById,
  getModelsForRole,
  getShippableModels,
} from '../catalog.js';

describe('on-device catalog: getModelById', () => {
  it('returns Qwen3-4B for the default model id', () => {
    const model = getModelById('qwen3-4b-instruct-2507');
    expect(model).toBeDefined();
    expect(model!.id).toBe('qwen3-4b-instruct-2507');
    expect(model!.license).toBe('Apache-2.0');
    expect(model!.role).toBe('default');
    expect(model!.shipsInV1).toBe(true);
  });

  it('returns undefined for unknown id', () => {
    expect(getModelById('totally-unknown')).toBeUndefined();
  });

  it('returns apple-foundation-models entry with fileSizeBytes 0', () => {
    const model = getModelById('apple-foundation-models');
    expect(model).toBeDefined();
    expect(model!.fileSizeBytes).toBe(0);
    expect(model!.supportedRuntimes).toContain('apple-foundation-models');
  });

  it('returns gemini-nano-aicore entry with fileSizeBytes 0', () => {
    const model = getModelById('gemini-nano-aicore');
    expect(model).toBeDefined();
    expect(model!.fileSizeBytes).toBe(0);
    expect(model!.supportedRuntimes).toContain('aicore');
  });
});

describe('on-device catalog: getDefaultModel', () => {
  it('returns qwen3-4b-instruct-2507 as default', () => {
    const model = getDefaultModel();
    expect(model.id).toBe('qwen3-4b-instruct-2507');
    expect(model.role).toBe('default');
    expect(model.capabilities.text).toBe(true);
    expect(model.capabilities.toolCalls).toBe(true);
    expect(model.contextWindow).toBe(262_144);
  });

  it('default model is apache-licensed', () => {
    expect(getDefaultModel().license).toBe('Apache-2.0');
  });
});

describe('on-device catalog: getShippableModels', () => {
  it('excludes phi-4-mini (internal eval hedge, shipsInV1=false)', () => {
    const shippable = getShippableModels();
    expect(shippable.some((m) => m.id === 'phi-4-mini-instruct')).toBe(false);
  });

  it('excludes gemma4 (shipsInV1=false)', () => {
    const shippable = getShippableModels();
    expect(shippable.some((m) => m.family === 'gemma4')).toBe(false);
  });

  it('excludes the vision pack until runtime artifacts are wired', () => {
    const shippable = getShippableModels();
    expect(shippable.some((m) => m.id === 'qwen2.5-vl-3b-instruct')).toBe(false);
  });

  it('includes system-multimodal entries', () => {
    const shippable = getShippableModels();
    expect(shippable.some((m) => m.id === 'apple-foundation-models')).toBe(true);
    expect(shippable.some((m) => m.id === 'gemini-nano-aicore')).toBe(true);
  });

  it('requires install presets for shippable downloadable ExecuTorch models', () => {
    for (const model of getShippableModels()) {
      if (model.fileSizeBytes <= 0) continue;
      if (!model.supportedRuntimes.includes('executorch')) continue;
      expect(model.executorchPreset).toBeDefined();
    }
  });
});

describe('on-device catalog: getLiteModeModel', () => {
  it('returns the llama 1B lite-mode model', () => {
    const model = getLiteModeModel();
    expect(model).toBeDefined();
    expect(model!.liteMode).toBe(true);
    expect(model!.role).toBe('lite-mode');
    expect(model!.id).toBe('llama-3.2-1b-instruct-spinquant');
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
