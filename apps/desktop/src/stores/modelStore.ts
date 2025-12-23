import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ModelMetadata } from '../constants/llm';
import { getAllModels, getModelMetadata } from '../constants/llm';
import { invoke } from '../lib/tauri-mock';
import type { Provider } from './settingsStore';

export interface ProviderStatus {
  provider: Provider;
  available: boolean;
  configured: boolean;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  ollamaRunning?: boolean;
}

export interface UsageStats {
  totalTokens: number;
  totalCost: number;
  messageCount: number;
  byProvider: Record<
    Provider,
    {
      tokens: number;
      cost: number;
      messages: number;
    }
  >;
  byModel: Record<
    string,
    {
      tokens: number;
      cost: number;
      messages: number;
    }
  >;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: Provider;
  available: boolean;
}

interface ModelState {
  selectedModel: string | null;
  selectedProvider: Provider | null;

  favorites: string[];

  recentModels: string[];

  providerStatuses: Record<Provider, ProviderStatus | null>;

  availableModels: ModelInfo[];

  usageStats: UsageStats | null;

  thinkingModeEnabled: boolean;

  loading: boolean;
  error: string | null;

  selectModel: (modelId: string, provider: Provider) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
  toggleThinkingMode: () => void;
  addToRecent: (modelId: string) => void;
  checkProviderStatus: (provider: Provider) => Promise<ProviderStatus>;
  checkAllProviders: () => Promise<void>;
  getUsageStats: () => Promise<UsageStats>;
  refreshUsageStats: () => Promise<void>;
  getAvailableModels: () => Promise<ModelInfo[]>;
  reset: () => void;
}

const defaultUsageStats: UsageStats = {
  totalTokens: 0,
  totalCost: 0,
  messageCount: 0,
  byProvider: {
    openai: { tokens: 0, cost: 0, messages: 0 },
    anthropic: { tokens: 0, cost: 0, messages: 0 },
    google: { tokens: 0, cost: 0, messages: 0 },
    ollama: { tokens: 0, cost: 0, messages: 0 },
    xai: { tokens: 0, cost: 0, messages: 0 },
    deepseek: { tokens: 0, cost: 0, messages: 0 },
    qwen: { tokens: 0, cost: 0, messages: 0 },
    mistral: { tokens: 0, cost: 0, messages: 0 },
    moonshot: { tokens: 0, cost: 0, messages: 0 },
  },
  byModel: {},
};

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const modelStorage = createJSONStorage<{
  selectedModel: string | null;
  selectedProvider: Provider | null;
  favorites: string[];
  recentModels: string[];
  thinkingModeEnabled: boolean;
}>(() => (typeof window === 'undefined' ? storageFallback : window.localStorage));

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModel: 'auto',
      selectedProvider: null,
      favorites: [],
      recentModels: [],
      providerStatuses: {
        openai: null,
        anthropic: null,
        google: null,
        ollama: null,
        xai: null,
        deepseek: null,
        qwen: null,
        mistral: null,
        moonshot: null,
      },
      availableModels: [],
      usageStats: null,
      thinkingModeEnabled: false,
      loading: false,
      error: null,

      selectModel: async (modelId: string, provider: Provider) => {
        try {
          const { useSettingsStore } = await import('./settingsStore');
          useSettingsStore.getState().setDefaultModel(provider, modelId);

          set({
            selectedModel: modelId,
            selectedProvider: provider,
          });

          get().addToRecent(modelId);
        } catch (error) {
          console.error('Failed to select model:', error);
          set({ error: String(error) });
        }
      },

      toggleFavorite: (modelId: string) => {
        set((state) => {
          const favorites = state.favorites.includes(modelId)
            ? state.favorites.filter((id) => id !== modelId)
            : [...state.favorites, modelId];
          return { favorites };
        });
      },

      toggleThinkingMode: () => {
        set((state) => ({ thinkingModeEnabled: !state.thinkingModeEnabled }));
      },

      addToRecent: (modelId: string) => {
        set((state) => {
          const filtered = state.recentModels.filter((id) => id !== modelId);
          const recentModels = [modelId, ...filtered].slice(0, 5);
          return { recentModels };
        });
      },

      checkProviderStatus: async (provider: Provider) => {
        try {
          const status = await invoke<ProviderStatus>('llm_check_provider_status', {
            provider,
          });

          set((state) => ({
            providerStatuses: {
              ...state.providerStatuses,
              [provider]: status,
            },
          }));

          return status;
        } catch (error) {
          const errorStatus: ProviderStatus = {
            provider,
            available: false,
            configured: false,
            error: String(error),
          };

          set((state) => ({
            providerStatuses: {
              ...state.providerStatuses,
              [provider]: errorStatus,
            },
          }));

          return errorStatus;
        }
      },

      checkAllProviders: async () => {
        set({ loading: true, error: null });
        try {
          const providers: Provider[] = [
            'openai',
            'anthropic',
            'google',
            'ollama',
            'xai',
            'deepseek',
            'qwen',
            'mistral',
            'moonshot',
          ];

          await Promise.all(providers.map((p) => get().checkProviderStatus(p)));

          set({ loading: false });
        } catch (error) {
          console.error('Failed to check provider statuses:', error);
          set({ error: String(error), loading: false });
        }
      },

      getUsageStats: async () => {
        set({ loading: true, error: null });
        try {
          const stats = await invoke<UsageStats>('llm_get_usage_stats');
          set({ usageStats: stats, loading: false });
          return stats;
        } catch (error) {
          console.error('Failed to get usage stats:', error);
          set({ error: String(error), loading: false, usageStats: defaultUsageStats });
          return defaultUsageStats;
        }
      },

      refreshUsageStats: async () => {
        await get().getUsageStats();
      },

      getAvailableModels: async () => {
        set({ loading: true, error: null });
        try {
          const models = await invoke<ModelInfo[]>('llm_get_available_models');
          set({ loading: false, availableModels: models });
          return models;
        } catch (error) {
          console.error('Failed to get available models:', error);
          set({ error: String(error), loading: false });

          const allModels = getAllModels();
          const fallbackModels = allModels.map((model) => ({
            id: model.id,
            name: model.name,
            provider: model.provider,
            available: true,
          }));
          set({ availableModels: fallbackModels });
          return fallbackModels;
        }
      },

      reset: () => {
        set({
          selectedModel: null,
          selectedProvider: null,
          favorites: [],
          recentModels: [],
          providerStatuses: {
            openai: null,
            anthropic: null,
            google: null,
            ollama: null,
            xai: null,
            deepseek: null,
            qwen: null,
            mistral: null,
            moonshot: null,
          },
          usageStats: null,
          loading: false,
          error: null,
        });
      },
    }),
    {
      name: 'agiworkforce-models',
      storage: modelStorage,
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        selectedProvider: state.selectedProvider,
        favorites: state.favorites,
        recentModels: state.recentModels,
        thinkingModeEnabled: state.thinkingModeEnabled,
      }),
    },
  ),
);

export const selectSelectedModel = (state: ModelState) => state.selectedModel;
export const selectSelectedProvider = (state: ModelState) => state.selectedProvider;
export const selectFavorites = (state: ModelState) => state.favorites;
export const selectRecentModels = (state: ModelState) => state.recentModels;
export const selectProviderStatuses = (state: ModelState) => state.providerStatuses;
export const selectUsageStats = (state: ModelState) => state.usageStats;
export const selectLoading = (state: ModelState) => state.loading;
export const selectError = (state: ModelState) => state.error;

export const selectFavoriteModelsMetadata = (state: ModelState): ModelMetadata[] => {
  return state.favorites.map((id) => getModelMetadata(id)).filter(Boolean) as ModelMetadata[];
};

export const selectRecentModelsMetadata = (state: ModelState): ModelMetadata[] => {
  return state.recentModels.map((id) => getModelMetadata(id)).filter(Boolean) as ModelMetadata[];
};

export const selectSelectedModelMetadata = (state: ModelState): ModelMetadata | null => {
  return state.selectedModel ? getModelMetadata(state.selectedModel) : null;
};

export const selectIsModelFavorite = (modelId: string) => (state: ModelState) =>
  state.favorites.includes(modelId);

export const selectProviderStatus = (provider: Provider) => (state: ModelState) =>
  state.providerStatuses[provider];

export const initializeModelStoreFromSettings = async () => {
  const modelStore = useModelStore.getState();

  if (modelStore.selectedModel && modelStore.selectedProvider) {
    return;
  }

  try {
    const { useSettingsStore } = await import('./settingsStore');
    const settingsStore = useSettingsStore.getState();

    const defaultProvider = settingsStore.llmConfig.defaultProvider;
    const defaultModel = settingsStore.llmConfig.defaultModels[defaultProvider];

    if (defaultProvider && defaultModel) {
      await modelStore.selectModel(defaultModel, defaultProvider);
    }
  } catch (error) {
    console.error('Failed to initialize model store from settings:', error);
  }
};
