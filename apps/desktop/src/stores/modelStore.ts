import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import type { ModelMetadata } from '../constants/llm';
import {
  getAllModels,
  getAllowedAutoModesForTier,
  getBestAutoModeForTier as getBestAutoModeForSubscriptionTier,
  getModelMetadata,
  getModelVariantPartner,
  isModelAllowedForTier,
  normalizeSubscriptionTier,
  normalizeModelId,
  PROVIDERS_IN_ORDER,
} from '../constants/llm';
import {
  getMinimumRequiredTier,
  getModelsForTierAndSurface,
  providerLabels,
  type PickerModelView,
} from '@agiworkforce/types';
import { invoke } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import type { Provider } from '../types/provider';
import type { SubscriptionTier } from '../constants/planModels';
import { useAccountStore } from './auth';
import type { PlanTier } from '../lib/cloudAccountTypes';
import { useAppModeStore, type AppMode } from './appModeStore';
import { useSettingsStore, waitForSettingsHydration } from './settingsStore';
import { useUIStore } from './ui';
import { storageFallback } from '../lib/storageFallback';
import {
  ollamaCheckStatus,
  ollamaDeleteModel,
  ollamaListModels,
  ollamaPullModel,
} from '../api/ollama';

export interface ManagedCloudModel {
  id: string;
  displayName: string;
  provider: Provider;
  providerDisplayName: string;
  tier: 'basic' | 'pro' | 'max';
  category: 'instant' | 'latest' | 'thinking';
  contextWindow: number;
  maxOutput: number;
}

type ChatPickerModel = PickerModelView & { contextWindow: number };

function hasPublishedTokenContext(model: PickerModelView): model is ChatPickerModel {
  return (
    typeof model.contextWindow === 'number' &&
    Number.isFinite(model.contextWindow) &&
    model.contextWindow > 0
  );
}

function buildManagedCloudModel(model: ChatPickerModel): ManagedCloudModel {
  const category: ManagedCloudModel['category'] =
    model.tier === 'economy' ? 'instant' : model.tier === 'premium' ? 'thinking' : 'latest';
  return {
    id: model.id,
    displayName: model.name,
    provider: model.provider as Provider,
    providerDisplayName: providerLabels[model.provider] ?? model.provider,
    tier: getMinimumRequiredTier(model.id) ?? 'basic',
    category,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
  };
}

export function getManagedCloudModelsForTier(tier: PlanTier | string): ManagedCloudModel[] {
  return getModelsForTierAndSurface(tier, 'desktop/cloud-chat', {
    modelTypes: ['chat', 'code', 'reasoning', 'multimodal', 'search'],
  })
    .filter(hasPublishedTokenContext)
    .map(buildManagedCloudModel);
}

export interface ProviderStatus {
  provider: Provider;
  available: boolean;
  configured: boolean;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  ollamaRunning?: boolean;
}

export interface RouterSuggestion {
  provider: string;
  model: string;
  reason: string;
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

export interface OllamaModelDetails {
  parameter_size: string;
  quantization_level: string;
  family: string;
  families: string[];
  parent_model: string;
  format: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details: OllamaModelDetails;
}

export type SpeedQualityMode = 'fast' | 'balanced' | 'quality';

interface ModelState {
  selectedModel: string | null;
  selectedProvider: Provider | null;

  favorites: string[];

  recentModels: string[];

  providerStatuses: Record<Provider, ProviderStatus | null>;

  availableModels: ModelInfo[];

  usageStats: UsageStats | null;

  thinkingModeEnabled: boolean;
  thinkingBudget: number;
  perTurnAdaptiveThinking: boolean;

  speedQualityMode: SpeedQualityMode;

  ollamaModels: OllamaModel[];
  ollamaAvailable: boolean;
  ollamaLoading: boolean;
  ollamaError: string | null;

  routerSuggestion: RouterSuggestion | null;

  loading: boolean;
  error: string | null;

  cloudModels: ManagedCloudModel[];

  loadModelsForMode: (mode: AppMode, planTier: PlanTier) => void;

  selectModel: (modelId: string, provider: Provider) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
  toggleThinkingMode: () => void;
  setThinkingBudget: (budget: number) => void;
  togglePerTurnAdaptiveThinking: () => void;
  clearPerTurnAdaptiveThinking: () => void;
  addToRecent: (modelId: string) => void;
  checkProviderStatus: (provider: Provider) => Promise<ProviderStatus>;
  checkAllProviders: () => Promise<void>;
  getUsageStats: () => Promise<UsageStats>;
  refreshUsageStats: () => Promise<void>;
  getAvailableModels: () => Promise<ModelInfo[]>;

  getRouterSuggestion: (context?: {
    taskType?: string;
    complexity?: string;
    requiresVision?: boolean;
  }) => Promise<RouterSuggestion>;

  resetSessionCost: () => Promise<void>;

  checkOllamaStatus: () => Promise<boolean>;
  fetchOllamaModels: () => Promise<OllamaModel[]>;
  pullOllamaModel: (modelName: string) => Promise<void>;
  deleteOllamaModel: (modelName: string) => Promise<void>;

  cycleModelVariant: () => void;

  setSpeedQualityMode: (mode: SpeedQualityMode) => void;

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
    lmstudio: { tokens: 0, cost: 0, messages: 0 },
    llamacpp: { tokens: 0, cost: 0, messages: 0 },
    vllm: { tokens: 0, cost: 0, messages: 0 },
    xai: { tokens: 0, cost: 0, messages: 0 },
    deepseek: { tokens: 0, cost: 0, messages: 0 },
    qwen: { tokens: 0, cost: 0, messages: 0 },
    moonshot: { tokens: 0, cost: 0, messages: 0 },
    perplexity: { tokens: 0, cost: 0, messages: 0 },
    zhipu: { tokens: 0, cost: 0, messages: 0 },
    managed_cloud: { tokens: 0, cost: 0, messages: 0 },
    mistral: { tokens: 0, cost: 0, messages: 0 },
    groq: { tokens: 0, cost: 0, messages: 0 },
    together: { tokens: 0, cost: 0, messages: 0 },
    fireworks: { tokens: 0, cost: 0, messages: 0 },
    cerebras: { tokens: 0, cost: 0, messages: 0 },
    deepinfra: { tokens: 0, cost: 0, messages: 0 },
    nvidia_nim: { tokens: 0, cost: 0, messages: 0 },
    open_router: { tokens: 0, cost: 0, messages: 0 },
    cohere: { tokens: 0, cost: 0, messages: 0 },
    ai21: { tokens: 0, cost: 0, messages: 0 },
    sambanova: { tokens: 0, cost: 0, messages: 0 },
    azure: { tokens: 0, cost: 0, messages: 0 },
    bedrock: { tokens: 0, cost: 0, messages: 0 },
  },
  byModel: {},
};

const MODEL_STORE_VERSION = 3;

function normalizePersistedCatalogModel(modelId: string | null | undefined): string | null {
  if (!modelId) return null;
  const canonical = normalizeModelId(modelId) ?? modelId;
  if (canonical === 'auto') return canonical;
  return getModelMetadata(canonical) ? canonical : null;
}

export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        selectedModel: 'auto',
        selectedProvider: 'managed_cloud',
        favorites: [],
        recentModels: [],
        providerStatuses: {
          openai: null,
          anthropic: null,
          google: null,
          ollama: null,
          lmstudio: null,
          llamacpp: null,
          vllm: null,
          xai: null,
          deepseek: null,
          qwen: null,
          moonshot: null,
          perplexity: null,
          zhipu: null,
          managed_cloud: null,
          mistral: null,
          groq: null,
          together: null,
          fireworks: null,
          cerebras: null,
          deepinfra: null,
          nvidia_nim: null,
          open_router: null,
          cohere: null,
          ai21: null,
          sambanova: null,
          azure: null,
          bedrock: null,
        },
        availableModels: [],
        usageStats: null,
        thinkingModeEnabled: false,
        thinkingBudget: 0,
        perTurnAdaptiveThinking: false,
        speedQualityMode: 'balanced' as SpeedQualityMode,

        ollamaModels: [],
        ollamaAvailable: false,
        ollamaLoading: false,
        ollamaError: null,

        routerSuggestion: null,

        loading: false,
        error: null,

        cloudModels: [],

        loadModelsForMode: (mode: AppMode, planTier: PlanTier) => {
          if (mode === 'cloud') {
            const models = getManagedCloudModelsForTier(planTier);
            set({ cloudModels: models }, undefined, 'model/loadModelsForMode/cloud');
          } else {
            set({ cloudModels: [] }, undefined, 'model/loadModelsForMode/local');
          }
        },

        selectModel: async (modelId: string, provider: Provider) => {
          try {
            let nextModelId = normalizeModelId(modelId) ?? modelId;
            let nextProvider = provider;

            if (nextModelId !== 'auto') {
              const selectedMetadata = getModelMetadata(nextModelId);
              if (selectedMetadata?.provider) {
                nextProvider = selectedMetadata.provider;
              }
            }

            if (provider !== 'ollama' && modelId !== 'auto') {
              const currentPlan = (() => {
                try {
                  return useAccountStore.getState()?.plan ?? 'free';
                } catch {
                  return 'free' as const;
                }
              })();
              const normalizedTier = normalizeSubscriptionTier(currentPlan);

              if (modelId.startsWith('auto-')) {
                const allowedAutoModes = getAllowedAutoModesForTier(normalizedTier);
                if (!allowedAutoModes.includes(modelId)) {
                  console.warn(
                    `[ModelStore] Blocking non-selectable Auto alias for ${normalizedTier} tier: ${modelId}. Falling back to Auto.`,
                  );
                  nextModelId = 'auto';
                  nextProvider = 'managed_cloud';
                }
              } else if (!isModelAllowedForTier(modelId, normalizedTier)) {
                console.warn(
                  `[ModelStore] Blocking disallowed model selection for ${normalizedTier} tier: ${modelId}. Falling back to Auto.`,
                );
                nextModelId = 'auto';
                nextProvider = 'managed_cloud';
              }
            }

            useSettingsStore.getState().setDefaultModel(nextProvider, nextModelId);

            set(
              {
                selectedModel: nextModelId,
                selectedProvider: nextProvider,
              },
              undefined,
              'model/selectModel',
            );

            get().addToRecent(nextModelId);
          } catch (error) {
            console.error('Failed to select model:', error);
            set({ error: getSimpleErrorMessage(error) }, undefined, 'model/selectModel/error');
          }
        },

        toggleFavorite: (modelId: string) => {
          const canonicalModelId = normalizeModelId(modelId) ?? modelId;
          set(
            (state) => {
              const favorites = state.favorites.includes(canonicalModelId)
                ? state.favorites.filter((id) => id !== canonicalModelId)
                : [...state.favorites, canonicalModelId];
              return { favorites };
            },
            undefined,
            'model/toggleFavorite',
          );
        },

        toggleThinkingMode: () => {
          set(
            (state) => ({ thinkingModeEnabled: !state.thinkingModeEnabled }),
            undefined,
            'model/toggleThinkingMode',
          );
        },

        setThinkingBudget: (budget: number) => {
          set(
            {
              thinkingBudget: budget,
              thinkingModeEnabled: budget > 0,
            },
            undefined,
            'model/setThinkingBudget',
          );
        },

        togglePerTurnAdaptiveThinking: () => {
          set(
            (state) => ({ perTurnAdaptiveThinking: !state.perTurnAdaptiveThinking }),
            undefined,
            'model/togglePerTurnAdaptiveThinking',
          );
        },

        clearPerTurnAdaptiveThinking: () => {
          set({ perTurnAdaptiveThinking: false }, undefined, 'model/clearPerTurnAdaptiveThinking');
        },

        addToRecent: (modelId: string) => {
          const canonicalModelId = normalizeModelId(modelId) ?? modelId;
          set(
            (state) => {
              const filtered = state.recentModels.filter((id) => id !== canonicalModelId);
              const recentModels = [canonicalModelId, ...filtered].slice(0, 5);
              return { recentModels };
            },
            undefined,
            'model/addToRecent',
          );
        },

        checkProviderStatus: async (provider: Provider) => {
          try {
            const status = await invoke<ProviderStatus>('llm_check_provider_status', {
              provider,
            });

            set(
              (state) => ({
                providerStatuses: {
                  ...state.providerStatuses,
                  [provider]: status,
                },
              }),
              undefined,
              'model/checkProviderStatus',
            );

            return status;
          } catch (error) {
            const errorStatus: ProviderStatus = {
              provider,
              available: false,
              configured: false,
              error: getSimpleErrorMessage(error),
            };

            set(
              (state) => ({
                providerStatuses: {
                  ...state.providerStatuses,
                  [provider]: errorStatus,
                },
              }),
              undefined,
              'model/checkProviderStatus/error',
            );

            return errorStatus;
          }
        },

        checkAllProviders: async () => {
          set({ loading: true, error: null }, undefined, 'model/checkAllProviders/start');
          try {
            await Promise.all(PROVIDERS_IN_ORDER.map((p) => get().checkProviderStatus(p)));
            set({ loading: false }, undefined, 'model/checkAllProviders/success');
          } catch (error) {
            console.error('Failed to check provider statuses:', error);
            set(
              { error: getSimpleErrorMessage(error), loading: false },
              undefined,
              'model/checkAllProviders/error',
            );
          }
        },

        getUsageStats: async () => {
          set({ loading: true, error: null }, undefined, 'model/getUsageStats/start');
          try {
            const stats = await invoke<UsageStats>('llm_get_usage_stats');
            set({ usageStats: stats, loading: false }, undefined, 'model/getUsageStats/success');
            return stats;
          } catch (error) {
            console.error('Failed to get usage stats:', error);
            set(
              {
                error: getSimpleErrorMessage(error),
                loading: false,
                usageStats: defaultUsageStats,
              },
              undefined,
              'model/getUsageStats/error',
            );
            return defaultUsageStats;
          }
        },

        refreshUsageStats: async () => {
          await get().getUsageStats();
        },

        getAvailableModels: async () => {
          set({ loading: true, error: null }, undefined, 'model/getAvailableModels/start');
          try {
            const models = await invoke<ModelInfo[]>('llm_get_available_models');
            set(
              { loading: false, availableModels: models },
              undefined,
              'model/getAvailableModels/success',
            );
            return models;
          } catch (error) {
            console.error('Failed to get available models:', error);
            set(
              { error: getSimpleErrorMessage(error), loading: false },
              undefined,
              'model/getAvailableModels/error',
            );

            const allModels = getAllModels();
            const fallbackModels = allModels.map((model) => ({
              id: model.id,
              name: model.name,
              provider: model.provider,
              available: true,
            }));
            set(
              { availableModels: fallbackModels },
              undefined,
              'model/getAvailableModels/fallback',
            );
            return fallbackModels;
          }
        },

        checkOllamaStatus: async () => {
          try {
            const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl;
            const available = await ollamaCheckStatus(baseUrl);
            set(
              { ollamaAvailable: available, ollamaError: null },
              undefined,
              'model/checkOllamaStatus',
            );
            return available;
          } catch (error) {
            console.error('Failed to check Ollama status:', error);
            set(
              { ollamaAvailable: false, ollamaError: getSimpleErrorMessage(error) },
              undefined,
              'model/checkOllamaStatus/error',
            );
            return false;
          }
        },

        fetchOllamaModels: async () => {
          set(
            { ollamaLoading: true, ollamaError: null },
            undefined,
            'model/fetchOllamaModels/start',
          );
          try {
            const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl;
            const available = await ollamaCheckStatus(baseUrl);
            if (!available) {
              set(
                {
                  ollamaAvailable: false,
                  ollamaModels: [],
                  ollamaLoading: false,
                  ollamaError:
                    'Ollama is not running. Start it with "ollama serve" in your terminal.',
                },
                undefined,
                'model/fetchOllamaModels/unavailable',
              );
              return [];
            }

            const models = await ollamaListModels(baseUrl);
            set(
              {
                ollamaModels: models,
                ollamaAvailable: true,
                ollamaLoading: false,
                ollamaError: null,
              },
              undefined,
              'model/fetchOllamaModels/success',
            );
            return models;
          } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            set(
              {
                ollamaModels: [],
                ollamaLoading: false,
                ollamaError: getSimpleErrorMessage(error),
              },
              undefined,
              'model/fetchOllamaModels/error',
            );
            return [];
          }
        },

        pullOllamaModel: async (modelName: string) => {
          set({ ollamaLoading: true, ollamaError: null }, undefined, 'model/pullOllamaModel/start');
          try {
            const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl;
            await ollamaPullModel(modelName, baseUrl);
            await get().fetchOllamaModels();
          } catch (error) {
            console.error('Failed to pull Ollama model:', error);
            set(
              { ollamaLoading: false, ollamaError: getSimpleErrorMessage(error) },
              undefined,
              'model/pullOllamaModel/error',
            );
            throw error;
          }
        },

        deleteOllamaModel: async (modelName: string) => {
          set(
            { ollamaLoading: true, ollamaError: null },
            undefined,
            'model/deleteOllamaModel/start',
          );
          try {
            const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl;
            await ollamaDeleteModel(modelName, baseUrl);
            await get().fetchOllamaModels();
          } catch (error) {
            console.error('Failed to delete Ollama model:', error);
            set(
              { ollamaLoading: false, ollamaError: getSimpleErrorMessage(error) },
              undefined,
              'model/deleteOllamaModel/error',
            );
            throw error;
          }
        },

        getRouterSuggestion: async (context?: {
          taskType?: string;
          complexity?: string;
          requiresVision?: boolean;
        }): Promise<RouterSuggestion> => {
          try {
            const suggestion = await invoke<RouterSuggestion>('router_suggestions', {
              context: context ?? null,
            });
            set({ routerSuggestion: suggestion }, undefined, 'model/getRouterSuggestion');
            return suggestion;
          } catch (error) {
            console.error('Failed to get router suggestion:', error);
            const fallback: RouterSuggestion = {
              provider: 'managed_cloud',
              model: 'auto',
              reason: 'fallback',
            };
            set({ routerSuggestion: fallback }, undefined, 'model/getRouterSuggestion/error');
            return fallback;
          }
        },

        resetSessionCost: async (): Promise<void> => {
          try {
            await invoke('reset_session_cost');
          } catch (error) {
            console.error('Failed to reset session cost:', error);
            throw error;
          }
        },

        cycleModelVariant: () => {
          const { selectedModel } = get();
          if (!selectedModel) {
            toast.info('No model selected');
            return;
          }
          const canonicalSelectedModel = normalizeModelId(selectedModel) ?? selectedModel;
          const variantId = getModelVariantPartner(canonicalSelectedModel);
          if (!variantId) {
            toast.info('No thinking/reasoning variant available for this model');
            return;
          }
          const variantMeta = getModelMetadata(variantId);
          const provider = variantMeta?.provider ?? get().selectedProvider ?? 'anthropic';
          void get().selectModel(variantId, provider);
          toast.success(`Switched to ${variantId}`);
        },

        setSpeedQualityMode: (mode: SpeedQualityMode) => {
          set({ speedQualityMode: mode }, undefined, 'model/setSpeedQualityMode');
        },

        reset: () => {
          set(
            {
              selectedModel: 'auto',
              selectedProvider: 'managed_cloud',
              favorites: [],
              recentModels: [],
              providerStatuses: {
                openai: null,
                anthropic: null,
                google: null,
                ollama: null,
                lmstudio: null,
                llamacpp: null,
                vllm: null,
                xai: null,
                deepseek: null,
                qwen: null,
                moonshot: null,
                perplexity: null,
                zhipu: null,
                managed_cloud: null,
                mistral: null,
                groq: null,
                together: null,
                fireworks: null,
                cerebras: null,
                deepinfra: null,
                nvidia_nim: null,
                open_router: null,
                cohere: null,
                ai21: null,
                sambanova: null,
                azure: null,
                bedrock: null,
              },
              availableModels: [],
              usageStats: null,
              ollamaModels: [],
              ollamaAvailable: false,
              ollamaLoading: false,
              ollamaError: null,
              routerSuggestion: null,
              speedQualityMode: 'balanced' as SpeedQualityMode,
              loading: false,
              error: null,
              cloudModels: [],
            },
            undefined,
            'model/reset',
          );
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
        }),
        migrate: (persistedState: unknown, _version: number) => {
          const state = persistedState as Partial<ModelState> | null;
          if (!state) {
            return (persistedState ?? {}) as ModelState;
          }

          const selectedModel = normalizePersistedCatalogModel(state.selectedModel) ?? 'auto';
          return {
            ...state,
            selectedModel,
            selectedProvider:
              selectedModel === 'auto'
                ? 'managed_cloud'
                : (getModelMetadata(selectedModel)?.provider ?? state.selectedProvider),
            favorites: (state.favorites ?? [])
              .map((modelId) => normalizePersistedCatalogModel(modelId))
              .filter((modelId): modelId is string => modelId !== null),
            recentModels: (state.recentModels ?? [])
              .map((modelId) => normalizePersistedCatalogModel(modelId))
              .filter((modelId): modelId is string => modelId !== null),
          } as ModelState;
        },
      },
    ),
    { name: 'ModelStore', enabled: import.meta.env.DEV },
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
  return state.favorites
    .map((id) => getModelMetadata(id))
    .filter((m): m is ModelMetadata => m !== null && m !== undefined);
};

export const selectRecentModelsMetadata = (state: ModelState): ModelMetadata[] => {
  return state.recentModels
    .map((id) => getModelMetadata(id))
    .filter((m): m is ModelMetadata => m !== null && m !== undefined);
};

export const selectSelectedModelMetadata = (state: ModelState): ModelMetadata | null => {
  return state.selectedModel ? getModelMetadata(state.selectedModel) : null;
};

export const selectIsModelFavorite = (modelId: string) => (state: ModelState) =>
  state.favorites.includes(normalizeModelId(modelId) ?? modelId);

export const selectProviderStatus = (provider: Provider) => (state: ModelState) =>
  state.providerStatuses[provider];

export const selectOllamaModels = (state: ModelState) => state.ollamaModels;
export const selectOllamaAvailable = (state: ModelState) => state.ollamaAvailable;
export const selectOllamaLoading = (state: ModelState) => state.ollamaLoading;
export const selectOllamaError = (state: ModelState) => state.ollamaError;

export const selectSpeedQualityMode = (state: ModelState) => state.speedQualityMode;
export const selectIsAutoMode = (state: ModelState) => state.selectedModel === 'auto';

export const selectRouterSuggestion = (state: ModelState) => state.routerSuggestion;

export const formatOllamaModelSize = (sizeInBytes: number): string => {
  const gb = sizeInBytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = sizeInBytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

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
    await waitForSettingsHydration();

    const settingsStore = useSettingsStore.getState();
    const currentPlan = (() => {
      try {
        return useAccountStore.getState()?.plan ?? 'free';
      } catch {
        return 'free' as const;
      }
    })();

    const defaultProvider = settingsStore.llmConfig.defaultProvider;
    const defaultModels = settingsStore.llmConfig.defaultModels as Record<string, string>;
    const defaultModel = defaultModels[defaultProvider] ?? 'auto';

    if (defaultProvider && defaultModel) {
      if (defaultProvider === 'managed_cloud' || defaultModel === 'auto') {
        await modelStore.selectModel('auto', 'managed_cloud');
      } else if (
        defaultProvider !== 'ollama' &&
        currentPlan &&
        !isModelAllowedForTier(defaultModel, normalizeSubscriptionTier(currentPlan))
      ) {
        await modelStore.selectModel('auto', 'managed_cloud');
      } else {
        await modelStore.selectModel(defaultModel, defaultProvider);
      }
    }
  } catch (error) {
    console.error('Failed to initialize model store from settings:', error);
  }
};

export const getBestAutoModeForTier = (tier: string): string => {
  return getBestAutoModeForSubscriptionTier(tier);
};

let _isEnforcingTier = false;

export const enforceModelTierRestriction = (planTier: string | null): void => {
  if (_isEnforcingTier) return;
  _isEnforcingTier = true;

  const modelStore = useModelStore.getState();
  const { selectedModel, selectedProvider, selectModel } = modelStore;

  const normalizedTier = normalizeSubscriptionTier(planTier) as SubscriptionTier;
  const allowed = getAllowedAutoModesForTier(normalizedTier);

  Promise.resolve()
    .then(async () => {
      const isSimpleMode = useUIStore.getState().mode === 'simple';
      const selectedMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
      const isAutoSelection = selectedModel === 'auto' || selectedModel?.startsWith('auto');
      const isOllamaSelection =
        selectedProvider === 'ollama' || selectedMetadata?.provider === 'ollama';

      if (isSimpleMode) {
        const bestAutoMode = getBestAutoModeForTier(normalizedTier);
        if (selectedModel !== bestAutoMode) {
          await selectModel(bestAutoMode, 'managed_cloud');
        }
      } else {
        if (isAutoSelection && selectedModel && !allowed.includes(selectedModel)) {
          await selectModel('auto', 'managed_cloud');
        } else if (
          selectedModel &&
          !isAutoSelection &&
          !isOllamaSelection &&
          !isModelAllowedForTier(selectedModel, normalizedTier)
        ) {
          await selectModel('auto', 'managed_cloud');
        }
      }
    })
    .catch(async (err) => {
      console.error('[ModelStore] enforceModelTierRestriction failed:', err);
      await selectModel('auto', 'managed_cloud');
    })
    .finally(() => {
      _isEnforcingTier = false;
    });
};

let _unsubscribePlanChanges: () => void = () => {};

if (typeof window !== 'undefined') {
  _unsubscribePlanChanges?.();
  _unsubscribePlanChanges = useAccountStore.subscribe(
    (state) => state.plan,
    (plan) => {
      const normalizedPlan = plan ?? 'free';
      enforceModelTierRestriction(normalizedPlan);
      useModelStore.getState().loadModelsForMode(useAppModeStore.getState().mode, normalizedPlan);
    },
  );
  const initialPlan = useAccountStore.getState().plan ?? 'free';
  enforceModelTierRestriction(initialPlan);
}

let _unsubscribeAppMode: () => void = () => {};

if (typeof window !== 'undefined') {
  _unsubscribeAppMode?.();
  const { mode } = useAppModeStore.getState();
  useModelStore.getState().loadModelsForMode(mode, useAccountStore.getState().plan ?? 'free');

  _unsubscribeAppMode = useAppModeStore.subscribe(
    (state) => state.mode,
    (newMode) => {
      useModelStore
        .getState()
        .loadModelsForMode(newMode, useAccountStore.getState().plan ?? 'free');
    },
  );
}

let _unsubscribeUiMode: () => void = () => {};

if (typeof window !== 'undefined') {
  _unsubscribeUiMode?.();
  _unsubscribeUiMode = useUIStore.subscribe(
    (state) => state.mode,
    (mode, prevMode) => {
      if (mode !== 'simple' || mode === prevMode) {
        return;
      }

      const currentPlan = useAccountStore.getState().account.plan ?? 'free';
      const targetAutoMode = getBestAutoModeForSubscriptionTier(currentPlan);
      const modelStore = useModelStore.getState();

      if (modelStore.selectedModel !== targetAutoMode) {
        void modelStore.selectModel(targetAutoMode, 'managed_cloud');
      }
    },
  );
}
