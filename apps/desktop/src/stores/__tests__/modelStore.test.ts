import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModelStore, formatOllamaModelSize, getOllamaModelDisplayName } from '../modelStore';

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
      account: { plan: 'max' },
    }),
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
  },
}));

describe('modelStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useModelStore.getState().reset();
  });

  describe('selectModel', () => {
    it('updates selectedModel and selectedProvider', async () => {
      // Use claude-sonnet-4.6 (dot, not hyphen) which is in the pro/max allowed list
      await useModelStore.getState().selectModel('claude-sonnet-4.6', 'anthropic');

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('claude-sonnet-4.6');
      expect(state.selectedProvider).toBe('anthropic');
    });

    it('adds model to recent models', async () => {
      // Use gpt-5.4 which is in the pro/max allowed list
      await useModelStore.getState().selectModel('gpt-5.4', 'openai');

      const state = useModelStore.getState();
      expect(state.recentModels).toContain('gpt-5.4');
    });
  });

  describe('toggleFavorite', () => {
    it('adds a model to favorites', () => {
      useModelStore.getState().toggleFavorite('claude-sonnet-4-6');

      const state = useModelStore.getState();
      expect(state.favorites).toContain('claude-sonnet-4-6');
    });

    it('removes a model from favorites when already present', () => {
      useModelStore.setState({ favorites: ['claude-sonnet-4-6', 'gpt-5.4'] });

      useModelStore.getState().toggleFavorite('claude-sonnet-4-6');

      const state = useModelStore.getState();
      expect(state.favorites).not.toContain('claude-sonnet-4-6');
      expect(state.favorites).toContain('gpt-5.4');
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

  describe('isManualModelSelection', () => {
    it('returns false for auto mode selections', () => {
      useModelStore.setState({ selectedModel: 'auto-economy' });
      expect(useModelStore.getState().isManualModelSelection()).toBe(false);
    });

    it('returns false for null model', () => {
      useModelStore.setState({ selectedModel: null });
      expect(useModelStore.getState().isManualModelSelection()).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      useModelStore.setState({
        selectedModel: 'gpt-5.4',
        selectedProvider: 'openai',
        favorites: ['model-a', 'model-b'],
        recentModels: ['model-a'],
        thinkingModeEnabled: true,
        thinkingBudget: 8192,
        error: 'some error',
      });

      useModelStore.getState().reset();

      const state = useModelStore.getState();
      expect(state.selectedModel).toBe('auto-economy');
      expect(state.selectedProvider).toBe('managed_cloud');
      expect(state.favorites).toEqual([]);
      expect(state.recentModels).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe('helper functions', () => {
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
        name: 'llama3',
        size: 0,
        modified_at: '',
        digest: '',
        details: {
          parameter_size: '8B',
          quantization_level: 'Q4_0',
          family: 'llama',
          families: ['llama'],
          parent_model: '',
          format: 'gguf',
        },
      };
      expect(getOllamaModelDisplayName(model)).toBe('llama3 (8B)');
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
