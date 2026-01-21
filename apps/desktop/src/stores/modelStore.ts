/**
 * Model Store
 *
 * Manages model selection, favorites, recent models, and provider status.
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version, migrate
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import type { ModelMetadata } from '../constants/llm';
import { getAllModels, getModelMetadata, PROVIDERS_IN_ORDER } from '../constants/llm';
import { invoke } from '../lib/tauri-mock';
import { getModelForRequest, isManualSelection, type TaskType } from '../lib/modelRouter';
import type { Provider } from '../types/provider';
import { useSettingsStore } from './settingsStore';

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

/**
 * Routing decision from the intelligent model router.
 * This tracks what model was selected for the current/last message.
 */
export interface RoutingDecision {
  /** The actual model ID that will be used */
  routedModelId: string;
  /** The task type that was detected */
  taskType: TaskType;
  /** Human-readable reason for the selection */
  reason: string;
  /** Whether routing was performed (false if manual selection) */
  wasRouted: boolean;
  /** Timestamp of the routing decision */
  timestamp: number;
}

/** Ollama model details from the Rust backend */
export interface OllamaModelDetails {
  parameter_size: string;
  quantization_level: string;
  family: string;
  families: string[];
  parent_model: string;
  format: string;
}

/** Ollama model representation from the Rust backend */
export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details: OllamaModelDetails;
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

  // Ollama-specific state
  ollamaModels: OllamaModel[];
  ollamaAvailable: boolean;
  ollamaLoading: boolean;
  ollamaError: string | null;

  // Intelligent routing state
  lastRoutingDecision: RoutingDecision | null;

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

  // Ollama-specific actions
  checkOllamaStatus: () => Promise<boolean>;
  fetchOllamaModels: () => Promise<OllamaModel[]>;
  pullOllamaModel: (modelName: string) => Promise<void>;
  deleteOllamaModel: (modelName: string) => Promise<void>;

  // Intelligent routing actions
  /**
   * Get the model to use for a specific message.
   * - If user manually selected a model, returns that model (bypass routing)
   * - If auto mode selected, routes to optimal model based on message content
   *
   * @param message - The user's message content
   * @param hasImages - Whether the message includes images
   * @returns The model ID to use and routing decision details
   */
  getRoutedModel: (message: string, hasImages?: boolean) => RoutingDecision;

  /**
   * Check if current selection is a manual model selection (bypasses routing)
   */
  isManualModelSelection: () => boolean;

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
    moonshot: { tokens: 0, cost: 0, messages: 0 },
    perplexity: { tokens: 0, cost: 0, messages: 0 },
    managed_cloud: { tokens: 0, cost: 0, messages: 0 },
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

// Version for storage migration
const MODEL_STORE_VERSION = 1;

export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        selectedModel: 'auto-balanced',
        selectedProvider: 'managed_cloud',
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
          moonshot: null,
          perplexity: null,
          managed_cloud: null,
        },
        availableModels: [],
        usageStats: null,
        thinkingModeEnabled: false,

        // Ollama-specific initial state
        ollamaModels: [],
        ollamaAvailable: false,
        ollamaLoading: false,
        ollamaError: null,

        // Intelligent routing initial state
        lastRoutingDecision: null,

        loading: false,
        error: null,

        selectModel: async (modelId: string, provider: Provider) => {
          try {
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
            await Promise.all(PROVIDERS_IN_ORDER.map((p) => get().checkProviderStatus(p)));
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

        // Ollama-specific actions
        checkOllamaStatus: async () => {
          try {
            const available = await invoke<boolean>('ollama_check_status');
            set({ ollamaAvailable: available, ollamaError: null });
            return available;
          } catch (error) {
            console.error('Failed to check Ollama status:', error);
            set({ ollamaAvailable: false, ollamaError: String(error) });
            return false;
          }
        },

        fetchOllamaModels: async () => {
          set({ ollamaLoading: true, ollamaError: null });
          try {
            // First check if Ollama is available
            const available = await invoke<boolean>('ollama_check_status');
            if (!available) {
              set({
                ollamaAvailable: false,
                ollamaModels: [],
                ollamaLoading: false,
                ollamaError:
                  'Ollama is not running. Start it with "ollama serve" in your terminal.',
              });
              return [];
            }

            const models = await invoke<OllamaModel[]>('ollama_list_models');
            set({
              ollamaModels: models,
              ollamaAvailable: true,
              ollamaLoading: false,
              ollamaError: null,
            });
            return models;
          } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            set({
              ollamaModels: [],
              ollamaLoading: false,
              ollamaError: String(error),
            });
            return [];
          }
        },

        pullOllamaModel: async (modelName: string) => {
          set({ ollamaLoading: true, ollamaError: null });
          try {
            await invoke('ollama_pull_model', { modelName });
            // Refresh the model list after pulling
            await get().fetchOllamaModels();
          } catch (error) {
            console.error('Failed to pull Ollama model:', error);
            set({ ollamaLoading: false, ollamaError: String(error) });
            throw error;
          }
        },

        deleteOllamaModel: async (modelName: string) => {
          set({ ollamaLoading: true, ollamaError: null });
          try {
            await invoke('ollama_delete_model', { modelName });
            // Refresh the model list after deletion
            await get().fetchOllamaModels();
          } catch (error) {
            console.error('Failed to delete Ollama model:', error);
            set({ ollamaLoading: false, ollamaError: String(error) });
            throw error;
          }
        },

        // Intelligent routing implementation
        getRoutedModel: (message: string, hasImages: boolean = false): RoutingDecision => {
          const { selectedModel } = get();

          // If no model selected, default to auto-balanced
          const effectiveModel = selectedModel || 'auto-balanced';

          // Use the model router to determine the actual model
          const routingResult = getModelForRequest(effectiveModel, message, hasImages);

          // Get task type from routing (default to 'general' for manual selections)
          let taskType: TaskType = 'general';
          if (routingResult.wasRouted) {
            // Extract task type from reason if available
            const taskMatch = routingResult.reason.match(/Keywords:.*?(\w+) task/i);
            const matchedType = taskMatch?.[1];
            if (matchedType) {
              taskType = matchedType.toLowerCase() as TaskType;
            }
          }

          const decision: RoutingDecision = {
            routedModelId: routingResult.modelId,
            taskType,
            reason: routingResult.reason,
            wasRouted: routingResult.wasRouted,
            timestamp: Date.now(),
          };

          // Store the routing decision for UI feedback
          set({ lastRoutingDecision: decision });

          return decision;
        },

        isManualModelSelection: (): boolean => {
          const { selectedModel } = get();
          if (!selectedModel) return false;
          return isManualSelection(selectedModel);
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
              moonshot: null,
              perplexity: null,
              managed_cloud: null,
            },
            usageStats: null,
            // Reset Ollama state
            ollamaModels: [],
            ollamaAvailable: false,
            ollamaLoading: false,
            ollamaError: null,
            // Reset routing state
            lastRoutingDecision: null,
            loading: false,
            error: null,
          });
        },
      })),
      {
        name: 'agiworkforce-models',
        version: MODEL_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          selectedModel: state.selectedModel,
          selectedProvider: state.selectedProvider,
          favorites: state.favorites,
          recentModels: state.recentModels,
          thinkingModeEnabled: state.thinkingModeEnabled,
        }),
        migrate: (persistedState: unknown, version: number) => {
          // Migration logic for future schema changes
          if (version === 0) {
            return persistedState as ModelState;
          }
          return persistedState as ModelState;
        },
      },
    ),
    { name: 'ModelStore', enabled: import.meta.env.DEV },
  ),
);

/**
 * Selectors for optimized subscriptions via subscribeWithSelector middleware.
 *
 * These selectors enable granular state subscriptions, preventing unnecessary re-renders
 * when only specific parts of the state change. While currently primarily used in tests,
 * they provide a foundation for performance optimization in complex components.
 *
 * Usage example:
 *   useModelStore.subscribe(selectSelectedModel, (model) => console.log('Model changed:', model));
 *   const model = useModelStore(selectSelectedModel);
 */
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

// Ollama selectors
export const selectOllamaModels = (state: ModelState) => state.ollamaModels;
export const selectOllamaAvailable = (state: ModelState) => state.ollamaAvailable;
export const selectOllamaLoading = (state: ModelState) => state.ollamaLoading;
export const selectOllamaError = (state: ModelState) => state.ollamaError;

// Routing selectors
export const selectLastRoutingDecision = (state: ModelState) => state.lastRoutingDecision;
export const selectIsAutoMode = (state: ModelState) =>
  state.selectedModel?.startsWith('auto-') ?? false;

/**
 * Helper function to format Ollama model size for display
 */
export const formatOllamaModelSize = (sizeInBytes: number): string => {
  const gb = sizeInBytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = sizeInBytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

/**
 * Helper function to get display name for Ollama model
 */
export const getOllamaModelDisplayName = (model: OllamaModel): string => {
  const paramSize = model.details?.parameter_size;
  if (paramSize) {
    return `${model.name} (${paramSize})`;
  }
  return model.name;
};

export const initializeModelStoreFromSettings = async () => {
  const modelStore = useModelStore.getState();

  if (modelStore.selectedModel && modelStore.selectedProvider) {
    return;
  }

  try {
    const settingsStore = useSettingsStore.getState();

    const defaultProvider = settingsStore.llmConfig.defaultProvider;
    // For subscription-only model, only managed_cloud and ollama are in defaultModels
    // Fall back to 'auto' for any other provider (should not happen in practice)
    const defaultModels = settingsStore.llmConfig.defaultModels as Record<string, string>;
    const defaultModel = defaultModels[defaultProvider] ?? 'auto';

    if (defaultProvider && defaultModel) {
      // If default is auto/managed_cloud, ensure we set the provider correctly in the store
      if (defaultProvider === 'managed_cloud' || defaultModel === 'auto') {
        await modelStore.selectModel('auto', 'managed_cloud');
      } else {
        await modelStore.selectModel(defaultModel, defaultProvider);
      }
    }
  } catch (error) {
    console.error('Failed to initialize model store from settings:', error);
  }
};
