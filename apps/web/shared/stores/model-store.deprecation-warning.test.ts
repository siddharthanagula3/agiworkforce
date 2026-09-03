import { describe, it, expect, vi } from 'vitest';

const { nearFutureIso, pastIso } = vi.hoisted(() => {
  const DAY_MS = 1000 * 60 * 60 * 24;
  return {
    nearFutureIso: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    pastIso: new Date(Date.now() - 10 * DAY_MS).toISOString(),
  };
});

vi.mock('@agiworkforce/types', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    ...actual,
    getAutoRoutingProfiles: () => [],
    getModelsForTierAndSurface: () => [
      { id: 'fixture-scheduled-model' },
      { id: 'fixture-retired-model' },
      { id: 'fixture-plain-model' },
    ],
  };
});

vi.mock('@shared/config/llm', () => ({
  PROVIDER_LABELS: { openai: 'OpenAI' },
  getDisplayModels: () => [],
  getModelMetadata: (id: string) => {
    const base = { name: id, modelType: 'chat', provider: 'openai', qualityTier: 'balanced' };
    if (id === 'fixture-scheduled-model') {
      return { id, ...base, deprecation_date: nearFutureIso };
    }
    if (id === 'fixture-retired-model') {
      return { id, ...base, deprecation_date: pastIso };
    }
    if (id === 'fixture-plain-model') {
      return { id, ...base, deprecation_date: null };
    }
    return undefined;
  },
  isAutoModeModelId: () => false,
  normalizeModelId: (id: string) => id,
}));

// Imported after the mocks above (vi.mock is hoisted regardless of position)
// so buildAvailableModels() runs against the fixture catalog.
import { AVAILABLE_MODELS } from './model-store';

describe('model-store · deprecation_date propagation', () => {
  it('propagates a still-future deprecation_date onto AIModel.deprecationDate', () => {
    const scheduled = AVAILABLE_MODELS.find((m) => m.id === 'fixture-scheduled-model');
    expect(scheduled).toBeDefined();
    expect(scheduled?.deprecationDate).toBe(nearFutureIso);
  });

  it('drops a model whose deprecation_date has already passed (isCurrentModel unchanged)', () => {
    expect(AVAILABLE_MODELS.find((m) => m.id === 'fixture-retired-model')).toBeUndefined();
  });

  it('leaves deprecationDate absent for a model with no scheduled retirement', () => {
    const plain = AVAILABLE_MODELS.find((m) => m.id === 'fixture-plain-model');
    expect(plain).toBeDefined();
    expect(plain).not.toHaveProperty('deprecationDate');
  });
});
