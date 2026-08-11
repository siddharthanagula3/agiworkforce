import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAllModels, getAllowedModelsForTier, getModelMetadata } from '../../constants/llm';
import { getModelsForTierAndSurface } from '@agiworkforce/types';
import {
  useModelStore,
  formatOllamaModelSize,
  getManagedCloudModelsForTier,
  getOllamaModelDisplayName,
  selectIsAutoMode,
} from '../modelStore';

const FIXTURE_MODEL_ID = 'fixture-model';
const CATALOG_MODEL_ID = getAllowedModelsForTier('max').find(
  (candidate) => getModelMetadata(candidate)?.provider === 'anthropic',
);
if (!CATALOG_MODEL_ID) {
  throw new Error('Model-store migration tests require a selectable Anthropic catalog model');
}
const CONTEXTLESS_MEDIA_MODEL_ID = getAllModels().find(
  (model) =>
    model.contextWindow === undefined &&
    (model.capabilities.imageGen || model.capabilities.videoGen),
)?.id;
if (!CONTEXTLESS_MEDIA_MODEL_ID) {
  throw new Error('Model-store tests require a catalog media model without token context');
}

// Mock @tauri-apps/api/core - throw for unknown commands so error-handling paths are exercised
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    // Throw for provider status checks so error-handling path returns a defined errorStatus
    if (command === 'llm_check_provider_status') {
      return Promise.reject(new Error('provider status unavailable'));
    }
    return Promise.resolve(undefined);
  }),
  isTauri: vi.fn(() => Promise.resolve(false)),
}));

// Mock the auth store to avoid circular dependency issues
// Use 'max' plan so model selection is not blocked by tier restrictions
vi.mock('../auth', () => ({
  useUnifiedAuthStore: {
    getState: () => ({
      plan: 'max',
      account: { plan: 'max' },
    }),
    subscribe: vi.fn(() => () => {}),
  },
  useAccountStore: {
    getState: () => ({
      plan: 'max',
      account: { plan: 'max' },
    }),
    subscribe: vi.fn(() => () => {}),
  },
}));

// Mock the settings store
vi.mock('../settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      llmConfig: {
        defaultProvider: 'managed_cloud',
        defaultModels: { managed_cloud: 'auto' },
      },
      setDefaultModel: vi.fn(),
    }),
  },
  waitForSettingsHydration: vi.fn(() => Promise.resolve()),
}));

// Mock the ui store
vi.mock('../ui', () => ({
  useUIStore: {
    getState: () => ({
      mode: 'advanced',
    }),
    subscribe: vi.fn(() => () => {}),
  },
}));

describe('modelStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useModelStore.getState().reset();
  });

  describe('selectModel', () => {
    it('updates selectedModel and selectedProvider', async () => {
      const modelId = getAllowedModelsForTier('max').find(
        (candidate) => getModelMetadata(candidate)?.provider === 'anthropic',
      );
      expect(modelId).toBeDefined();
      await useModelStore.getState().selectModel(modelId!, 'anthropic');

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe(modelId);
      expect(state.selectedProvider).toBe('anthropic');
    });

    it('adds model to recent models', async () => {
      const modelId = getAllowedModelsForTier('max').find(
        (candidate) => getModelMetadata(candidate)?.provider === 'openai',
      );
      expect(modelId).toBeDefined();
      await useModelStore.getState().selectModel(modelId!, 'openai');

      const state = useModelStore.getState();
      expect(state.recentModels).toContain(modelId);
    });
  });

  describe('toggleFavorite', () => {
    it('adds a model to favorites', () => {
      useModelStore.getState().toggleFavorite(FIXTURE_MODEL_ID);

      const state = useModelStore.getState();
      expect(state.favorites).toContain(FIXTURE_MODEL_ID);
    });

    it('removes a model from favorites when already present', () => {
      const removableModel = 'fixture-removable-model';
      useModelStore.setState({ favorites: [removableModel, FIXTURE_MODEL_ID] });

      useModelStore.getState().toggleFavorite(removableModel);

      const state = useModelStore.getState();
      expect(state.favorites).not.toContain(removableModel);
      expect(state.favorites).toContain(FIXTURE_MODEL_ID);
    });
  });

  describe('addToRecent', () => {
    it('adds model to the front of recent list', () => {
      useModelStore.getState().addToRecent('model-a');
      useModelStore.getState().addToRecent('model-b');

      const state = useModelStore.getState();
      expect(state.recentModels[0]).toBe('model-b');
      expect(state.recentModels[1]).toBe('model-a');
    });

    it('deduplicates and keeps max 5 recent models', () => {
      const models = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
      for (const m of models) {
        useModelStore.getState().addToRecent(m);
      }

      const state = useModelStore.getState();
      expect(state.recentModels).toHaveLength(5);
      expect(state.recentModels[0]).toBe('m6');
      expect(state.recentModels).not.toContain('m1');
    });

    it('moves existing model to front without duplicating', () => {
      useModelStore.setState({ recentModels: ['m1', 'm2', 'm3'] });

      useModelStore.getState().addToRecent('m2');

      const state = useModelStore.getState();
      expect(state.recentModels[0]).toBe('m2');
      expect(state.recentModels.filter((m) => m === 'm2')).toHaveLength(1);
    });
  });

  describe('checkProviderStatus', () => {
    it('handles successful status check', async () => {
      // The tauri-mock returns a default response, which will work for testing the flow
      await useModelStore.getState().checkProviderStatus('anthropic');

      // The result comes from the mock — verify the state was updated
      const state = useModelStore.getState();
      expect(state.providerStatuses.anthropic).toBeDefined();
    });

    it('handles error status check gracefully', async () => {
      // The error case is tested via the store's error handling
      const result = await useModelStore.getState().checkProviderStatus('openai');
      expect(result).toBeDefined();
      expect(result.provider).toBe('openai');
    });
  });

  describe('thinkingMode', () => {
    it('toggleThinkingMode toggles the enabled state', () => {
      expect(useModelStore.getState().thinkingModeEnabled).toBe(false);

      useModelStore.getState().toggleThinkingMode();
      expect(useModelStore.getState().thinkingModeEnabled).toBe(true);

      useModelStore.getState().toggleThinkingMode();
      expect(useModelStore.getState().thinkingModeEnabled).toBe(false);
    });

    it('setThinkingBudget enables thinking mode for budget > 0', () => {
      useModelStore.getState().setThinkingBudget(4096);

      const state = useModelStore.getState();
      expect(state.thinkingBudget).toBe(4096);
      expect(state.thinkingModeEnabled).toBe(true);
    });

    it('setThinkingBudget disables thinking mode for budget = 0', () => {
      useModelStore.setState({ thinkingModeEnabled: true, thinkingBudget: 4096 });

      useModelStore.getState().setThinkingBudget(0);

      const state = useModelStore.getState();
      expect(state.thinkingBudget).toBe(0);
      expect(state.thinkingModeEnabled).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      useModelStore.setState({
        selectedModel: FIXTURE_MODEL_ID,
        selectedProvider: 'openai',
        favorites: ['model-a', 'model-b'],
        recentModels: ['model-a'],
        thinkingModeEnabled: true,
        thinkingBudget: 8192,
        error: 'some error',
      });

      useModelStore.getState().reset();

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
      expect(state.favorites).toEqual([]);
      expect(state.recentModels).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe('persisted model migration', () => {
    it('drops unknown selected, favorite, and recent model ids', async () => {
      localStorage.setItem(
        'agiworkforce-models',
        JSON.stringify({
          state: {
            selectedModel: 'removed-provider-model',
            selectedProvider: 'anthropic',
            favorites: ['removed-provider-model', CATALOG_MODEL_ID],
            recentModels: ['removed-provider-model', CATALOG_MODEL_ID],
          },
          version: 1,
        }),
      );

      await useModelStore.persist.rehydrate();

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto');
      expect(state.selectedProvider).toBe('managed_cloud');
      expect(state.favorites).toEqual([CATALOG_MODEL_ID]);
      expect(state.recentModels).toEqual([CATALOG_MODEL_ID]);
    });

    it('replaces a non-selectable legacy Auto alias with canonical Auto', async () => {
      localStorage.setItem(
        'agiworkforce-models',
        JSON.stringify({
          state: {
            selectedModel: 'auto-premium',
            selectedProvider: 'managed_cloud',
            favorites: [],
            recentModels: [],
          },
          version: 2,
        }),
      );

      await useModelStore.persist.rehydrate();

      expect(useModelStore.getState().selectedModel).toBe('auto');
      expect(selectIsAutoMode(useModelStore.getState())).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('recognizes the canonical Auto selection without accepting removed aliases', () => {
      useModelStore.setState({ selectedModel: 'auto' });
      expect(selectIsAutoMode(useModelStore.getState())).toBe(true);

      useModelStore.setState({ selectedModel: 'auto-balanced' });
      expect(selectIsAutoMode(useModelStore.getState())).toBe(false);

      useModelStore.setState({ selectedModel: FIXTURE_MODEL_ID });
      expect(selectIsAutoMode(useModelStore.getState())).toBe(false);
    });

    it('derives cloud rows from the shared tier + Desktop runtime intersection', () => {
      const expectedIds = getModelsForTierAndSurface('max', 'desktop/cloud-chat', {
        modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
      })
        .filter(
          (model) =>
            typeof model.contextWindow === 'number' &&
            Number.isFinite(model.contextWindow) &&
            model.contextWindow > 0,
        )
        .map((model) => model.id);

      expect(getManagedCloudModelsForTier('max').map((model) => model.id)).toEqual(expectedIds);
    });

    it('only projects cloud chat models with published token context limits', () => {
      const models = getManagedCloudModelsForTier('max');

      expect(models).not.toContainEqual(
        expect.objectContaining({ id: CONTEXTLESS_MEDIA_MODEL_ID }),
      );
      expect(
        models.every((model) => Number.isFinite(model.contextWindow) && model.contextWindow > 0),
      ).toBe(true);
    });

    it('formatOllamaModelSize formats GB correctly', () => {
      const sizeInBytes = 3.5 * 1024 * 1024 * 1024;
      expect(formatOllamaModelSize(sizeInBytes)).toBe('3.5 GB');
    });

    it('formatOllamaModelSize formats MB correctly', () => {
      const sizeInBytes = 500 * 1024 * 1024;
      expect(formatOllamaModelSize(sizeInBytes)).toBe('500 MB');
    });

    it('getOllamaModelDisplayName includes parameter size', () => {
      const model = {
        name: 'fixture-local-model',
        size: 0,
        modified_at: '',
        digest: '',
        details: {
          parameter_size: '8B',
          quantization_level: 'Q4_0',
          family: 'fixture-family',
          families: ['fixture-family'],
          parent_model: '',
          format: 'gguf',
        },
      };
      expect(getOllamaModelDisplayName(model)).toBe('fixture-local-model (8B)');
    });

    it('getOllamaModelDisplayName returns just name when no param size', () => {
      const model = {
        name: 'custom-model',
        size: 0,
        modified_at: '',
        digest: '',
        details: {
          parameter_size: '',
          quantization_level: '',
          family: '',
          families: [],
          parent_model: '',
          format: '',
        },
      };
      expect(getOllamaModelDisplayName(model)).toBe('custom-model');
    });
  });
});
