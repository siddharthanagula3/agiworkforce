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
import { toast } from 'sonner';
import type { ModelMetadata } from '../constants/llm';
import {
  getAllModels,
  getAllowedAutoModesForTier,
  getBestAutoModeForTier as getBestAutoModeForSubscriptionTier,
  getModelMetadata,
  isModelAllowedForTier,
  normalizeSubscriptionTier,
  PROVIDERS_IN_ORDER,
} from '../constants/llm';
import { invoke } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import {
  getModelForRequest,
  getModelForRequestAsync,
  isManualSelection,
  type TaskType,
} from '../lib/modelRouter';
import type { Provider } from '../types/provider';
import type { SubscriptionTier } from '../constants/planModels';
import { useAccountStore } from './auth';
import { useSettingsStore } from './settingsStore';
import { storageFallback } from '../lib/storageFallback';
import type { AppMode, PlanTier } from './appModeStore';

// ---------------------------------------------------------------------------
// Managed cloud models — available in cloud mode without user API keys.
// Tier: 'hobby' models shown to all cloud users; 'pro' models require pro+.
// ---------------------------------------------------------------------------

interface ManagedCloudModel {
  id: string;
  displayName: string;
  provider: Provider;
  providerDisplayName: string;
  tier: 'hobby' | 'pro';
  category: 'instant' | 'latest' | 'thinking';
  contextWindow: number;
  maxOutput: number;
}

const MANAGED_CLOUD_MODELS: ManagedCloudModel[] = [
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    provider: 'anthropic',
    providerDisplayName: 'Anthropic',
    tier: 'hobby',
    category: 'instant',
    contextWindow: 200000,
    maxOutput: 8192,
  },
  {
    id: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    provider: 'openai',
    providerDisplayName: 'OpenAI',
    tier: 'hobby',
    category: 'instant',
    contextWindow: 128000,
    maxOutput: 16384,
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
    providerDisplayName: 'Google',
    tier: 'hobby',
    category: 'instant',
    contextWindow: 1000000,
    maxOutput: 8192,
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    providerDisplayName: 'Anthropic',
    tier: 'pro',
    category: 'latest',
    contextWindow: 200000,
    maxOutput: 8192,
  },
  {
    id: 'gpt-4o',
    displayName: 'GPT-4o',
    provider: 'openai',
    providerDisplayName: 'OpenAI',
    tier: 'pro',
    category: 'latest',
    contextWindow: 128000,
    maxOutput: 16384,
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    providerDisplayName: 'Google',
    tier: 'pro',
    category: 'thinking',
    contextWindow: 1000000,
    maxOutput: 65536,
  },
];

/**
 * Returns the managed cloud models available for the given plan tier.
 * hobby/free: hobby-tier models only
 * pro/max/enterprise: hobby + pro-tier models
 */
export function getManagedCloudModelsForTier(tier: PlanTier | string): ManagedCloudModel[] {
  const isPro = tier === 'pro' || tier === 'max' || tier === 'enterprise';
  return MANAGED_CLOUD_MODELS.filter((m) => isPro || m.tier === 'hobby');
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

/** Router suggestion from the Rust LLM router */
export interface RouterSuggestion {
  provider: string;
  model: string;
  reason: string;
}

/** Model capability metadata from the Rust backend */
export interface ModelCapabilities {
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  contextLength: number;
  toolMode: 'native' | 'prompt_injection';
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

/** Speed/quality tradeoff mode for each request. */
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

  /** Controls the speed/quality tradeoff for all requests. */
  speedQualityMode: SpeedQualityMode;

  // Ollama-specific state
  ollamaModels: OllamaModel[];
  ollamaAvailable: boolean;
  ollamaLoading: boolean;
  ollamaError: string | null;

  // Intelligent routing state
  lastRoutingDecision: RoutingDecision | null;

  // Router suggestion state
  routerSuggestion: RouterSuggestion | null;

  // Model capabilities cache
  modelCapabilities: Record<string, ModelCapabilities>;

  loading: boolean;
  error: string | null;

  /**
   * Managed cloud models available for the current plan tier.
   * Populated when app is in cloud mode; empty in local mode.
   */
  cloudModels: ManagedCloudModel[];

  /**
   * Reload the model list when the app mode or plan tier changes.
   * In cloud mode: loads MANAGED_CLOUD_MODELS filtered by tier.
   * In local mode: clears cloudModels (BYOK models come from getAllModels()).
   */
  loadModelsForMode: (mode: AppMode, planTier: PlanTier) => void;

  selectModel: (modelId: string, provider: Provider) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
  toggleThinkingMode: () => void;
  setThinkingBudget: (budget: number) => void;
  addToRecent: (modelId: string) => void;
  checkProviderStatus: (provider: Provider) => Promise<ProviderStatus>;
  checkAllProviders: () => Promise<void>;
  getUsageStats: () => Promise<UsageStats>;
  refreshUsageStats: () => Promise<void>;
  getAvailableModels: () => Promise<ModelInfo[]>;

  // Router suggestions from the Rust LLM router
  getRouterSuggestion: (context?: {
    taskType?: string;
    complexity?: string;
    requiresVision?: boolean;
  }) => Promise<RouterSuggestion>;

  // Model capability detection (Ollama probing + cloud defaults)
  getModelCapabilities: (
    provider: string,
    modelId: string,
    baseUrl?: string,
  ) => Promise<ModelCapabilities>;

  // Clear cached Ollama capability data
  clearModelCapabilityCache: () => Promise<void>;

  // Reset the session cost accumulator in the LLM router
  resetSessionCost: () => Promise<void>;

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
   * Async version of getRoutedModel that uses LLM classification for Pro+ tiers.
   * When the selected auto mode is balanced or premium and local classification
   * has low confidence, this sends a lightweight classify request to a fast model
   * for more accurate task type detection.
   *
   * @param message - The user's message content
   * @param hasImages - Whether the message includes images
   * @param llmClassify - Callback to classify via a fast LLM (e.g. Gemini Flash)
   */
  getRoutedModelAsync: (
    message: string,
    hasImages?: boolean,
    llmClassify?: (prompt: string) => Promise<string>,
  ) => Promise<RoutingDecision>;

  /**
   * Check if current selection is a manual model selection (bypasses routing)
   */
  isManualModelSelection: () => boolean;

  /**
   * Cycle the currently selected model to its thinking/reasoning counterpart, or back.
   * E.g. claude-sonnet-4-6 ↔ claude-sonnet-4-6-thinking, gpt-5.4 ↔ o3, etc.
   * Shows a toast with the result.
   */
  cycleModelVariant: () => void;

  /**
   * Set the speed/quality mode that controls how requests are routed and how
   * much extended thinking budget is applied.
   */
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

// storageFallback is imported from '../lib/storageFallback'

// ---------------------------------------------------------------------------
// Model variant map — maps a model to its thinking/reasoning counterpart
// ---------------------------------------------------------------------------

const MODEL_VARIANT_MAP: Record<string, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4-6-thinking',
  'claude-sonnet-4-6-thinking': 'claude-sonnet-4-6',
  'claude-opus-4-6': 'claude-opus-4-6-thinking',
  'claude-opus-4-6-thinking': 'claude-opus-4-6',
  'gpt-5.4': 'o3',
  o3: 'gpt-5.4',
  'gpt-5.4-mini': 'o3-mini',
  'o3-mini': 'gpt-5.4-mini',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-thinking',
  'gemini-3.1-flash-lite-thinking': 'gemini-3.1-flash-lite',
  'deepseek-chat': 'deepseek-reasoner',
  'deepseek-reasoner': 'deepseek-chat',
};

// Version for storage migration
const MODEL_STORE_VERSION = 1;

export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        selectedModel: 'auto-economy',
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
        speedQualityMode: 'balanced' as SpeedQualityMode,

        // Ollama-specific initial state
        ollamaModels: [],
        ollamaAvailable: false,
        ollamaLoading: false,
        ollamaError: null,

        // Intelligent routing initial state
        lastRoutingDecision: null,

        // Router suggestion initial state
        routerSuggestion: null,

        // Model capabilities cache
        modelCapabilities: {},

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
            let nextModelId = modelId;
            let nextProvider = provider;

            if (provider !== 'ollama' && modelId !== 'auto') {
              const { useUnifiedAuthStore } = await import('./auth');
              const currentPlan = (() => {
                try {
                  return useUnifiedAuthStore.getState()?.plan ?? 'hobby';
                } catch {
                  return 'hobby' as const;
                }
              })();
              const normalizedTier = normalizeSubscriptionTier(currentPlan);

              if (modelId.startsWith('auto-')) {
                const allowedAutoModes = getAllowedAutoModesForTier(normalizedTier);
                if (!allowedAutoModes.includes(modelId)) {
                  console.warn(
                    `[ModelStore] Blocking disallowed auto-mode for ${normalizedTier} tier: ${modelId}. Falling back to auto-economy.`,
                  );
                  nextModelId = 'auto-economy';
                  nextProvider = 'managed_cloud';
                }
              } else if (!isModelAllowedForTier(modelId, normalizedTier)) {
                console.warn(
                  `[ModelStore] Blocking disallowed model selection for ${normalizedTier} tier: ${modelId}. Falling back to auto-economy.`,
                );
                nextModelId = 'auto-economy';
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
          set(
            (state) => {
              const favorites = state.favorites.includes(modelId)
                ? state.favorites.filter((id) => id !== modelId)
                : [...state.favorites, modelId];
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

        addToRecent: (modelId: string) => {
          set(
            (state) => {
              const filtered = state.recentModels.filter((id) => id !== modelId);
              const recentModels = [modelId, ...filtered].slice(0, 5);
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

        // Ollama-specific actions
        checkOllamaStatus: async () => {
          try {
            const available = await invoke<boolean>('ollama_check_status');
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
            // First check if Ollama is available
            const available = await invoke<boolean>('ollama_check_status');
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

            const models = await invoke<OllamaModel[]>('ollama_list_models');
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
            await invoke('ollama_pull_model', { modelName });
            // Refresh the model list after pulling
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
            await invoke('ollama_delete_model', { modelName });
            // Refresh the model list after deletion
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

        // Router suggestion from the Rust LLM router
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

        // Model capability detection
        getModelCapabilities: async (
          provider: string,
          modelId: string,
          baseUrl?: string,
        ): Promise<ModelCapabilities> => {
          // Check cache first
          const cacheKey = `${provider}:${modelId}`;
          const cached = get().modelCapabilities[cacheKey];
          if (cached) return cached;

          try {
            const raw = await invoke<{
              supports_tools: boolean;
              supports_vision: boolean;
              supports_streaming: boolean;
              supports_thinking: boolean;
              context_length: number;
              tool_mode: string;
            }>('get_model_capabilities', {
              provider,
              modelId,
              baseUrl: baseUrl ?? null,
            });

            const capabilities: ModelCapabilities = {
              supportsTools: raw.supports_tools,
              supportsVision: raw.supports_vision,
              supportsStreaming: raw.supports_streaming,
              supportsThinking: raw.supports_thinking,
              contextLength: raw.context_length,
              toolMode: raw.tool_mode as 'native' | 'prompt_injection',
            };

            set(
              (state) => ({
                modelCapabilities: {
                  ...state.modelCapabilities,
                  [cacheKey]: capabilities,
                },
              }),
              undefined,
              'model/getModelCapabilities',
            );

            return capabilities;
          } catch (error) {
            console.error('Failed to get model capabilities:', error);
            // Return cloud-like defaults on error
            const defaults: ModelCapabilities = {
              supportsTools: true,
              supportsVision: true,
              supportsStreaming: true,
              supportsThinking: false,
              contextLength: 128_000,
              toolMode: 'native',
            };
            return defaults;
          }
        },

        // Clear Ollama capability cache
        clearModelCapabilityCache: async (): Promise<void> => {
          try {
            await invoke('clear_model_capability_cache');
            // Also clear the local JS-side cache
            set({ modelCapabilities: {} }, undefined, 'model/clearModelCapabilityCache');
          } catch (error) {
            console.error('Failed to clear model capability cache:', error);
          }
        },

        // Reset session cost accumulator
        resetSessionCost: async (): Promise<void> => {
          try {
            await invoke('reset_session_cost');
          } catch (error) {
            console.error('Failed to reset session cost:', error);
            throw error;
          }
        },

        // Intelligent routing implementation
        getRoutedModel: (message: string, hasImages: boolean = false): RoutingDecision => {
          const { selectedModel } = get();
          const currentPlan = (() => {
            try {
              return useAccountStore.getState()?.account?.plan ?? 'hobby';
            } catch {
              return 'hobby' as const;
            }
          })();

          // If no model is selected yet, use the best auto mode the current plan allows.
          const effectiveModel = resolveEffectiveModelForTier(selectedModel, currentPlan);

          // Use the model router to determine the actual model
          const routingResult = getModelForRequest(effectiveModel, message, hasImages);

          const decision: RoutingDecision = {
            routedModelId: routingResult.modelId,
            taskType: routingResult.taskType,
            reason: routingResult.reason,
            wasRouted: routingResult.wasRouted,
            timestamp: Date.now(),
          };

          return decision;
        },

        getRoutedModelAsync: async (
          message: string,
          hasImages: boolean = false,
          llmClassify?: (prompt: string) => Promise<string>,
        ): Promise<RoutingDecision> => {
          const { selectedModel } = get();
          const currentPlan = (() => {
            try {
              return useAccountStore.getState()?.account?.plan ?? 'hobby';
            } catch {
              return 'hobby' as const;
            }
          })();

          const effectiveModel = resolveEffectiveModelForTier(selectedModel, currentPlan);

          const routingResult = await getModelForRequestAsync(
            effectiveModel,
            message,
            hasImages,
            llmClassify,
          );

          const decision: RoutingDecision = {
            routedModelId: routingResult.modelId,
            taskType: routingResult.taskType,
            reason: routingResult.reason,
            wasRouted: routingResult.wasRouted,
            timestamp: Date.now(),
          };

          return decision;
        },

        isManualModelSelection: (): boolean => {
          const { selectedModel } = get();
          if (!selectedModel) return false;
          return isManualSelection(selectedModel);
        },

        cycleModelVariant: () => {
          const { selectedModel } = get();
          if (!selectedModel) {
            toast.info('No model selected');
            return;
          }
          const variantId = MODEL_VARIANT_MAP[selectedModel];
          if (!variantId) {
            toast.info('No thinking/reasoning variant available for this model');
            return;
          }
          // Determine provider from the variant model metadata; fall back to current provider
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
              selectedModel: 'auto-economy',
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
              // Reset Ollama state
              ollamaModels: [],
              ollamaAvailable: false,
              ollamaLoading: false,
              ollamaError: null,
              // Reset routing state
              lastRoutingDecision: null,
              // Reset router suggestion and capabilities cache
              routerSuggestion: null,
              modelCapabilities: {},
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
          recentModels: state.recentModels,
          thinkingModeEnabled: state.thinkingModeEnabled,
          thinkingBudget: state.thinkingBudget,
          speedQualityMode: state.speedQualityMode,
        }),
        migrate: (persistedState: unknown, _version: number) => {
          // No schema changes yet — MODEL_STORE_VERSION started at 1.
          // Add sequential if (version < N) blocks here when schema changes are needed.
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
export const selectSpeedQualityMode = (state: ModelState) => state.speedQualityMode;
export const selectIsAutoMode = (state: ModelState) =>
  state.selectedModel?.startsWith('auto-') ?? false;

// Router suggestion selectors
export const selectRouterSuggestion = (state: ModelState) => state.routerSuggestion;
export const selectModelCapabilities = (state: ModelState) => state.modelCapabilities;
export const selectModelCapability = (provider: string, modelId: string) => (state: ModelState) =>
  state.modelCapabilities[`${provider}:${modelId}`] ?? null;

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

/**
 * STR-009 fix: Wait for settings hydration before reading from settings store.
 * This prevents race conditions where modelStore might initialize with stale
 * defaults before settings have been loaded from localStorage.
 */
export const initializeModelStoreFromSettings = async () => {
  const modelStore = useModelStore.getState();

  if (modelStore.selectedModel && modelStore.selectedProvider) {
    return;
  }

  try {
    // STR-009 fix: Wait for settings to hydrate before reading from store
    const { waitForSettingsHydration } = await import('./settingsStore');
    await waitForSettingsHydration();

    const settingsStore = useSettingsStore.getState();
    const { useUnifiedAuthStore } = await import('./auth');
    const currentPlan = (() => {
      try {
        return useUnifiedAuthStore.getState()?.plan ?? 'hobby';
      } catch {
        return 'hobby' as const;
      }
    })();

    const defaultProvider = settingsStore.llmConfig.defaultProvider;
    // For subscription-only model, only managed_cloud and ollama are in defaultModels
    // Fall back to 'auto' for any other provider (should not happen in practice)
    const defaultModels = settingsStore.llmConfig.defaultModels as Record<string, string>;
    const defaultModel = defaultModels[defaultProvider] ?? 'auto';

    if (defaultProvider && defaultModel) {
      // If default is auto/managed_cloud, ensure we set the provider correctly in the store
      // Use 'auto-economy' as the default auto mode (lowest common denominator for all tiers)
      if (defaultProvider === 'managed_cloud' || defaultModel === 'auto') {
        await modelStore.selectModel('auto-economy', 'managed_cloud');
      } else if (
        defaultProvider !== 'ollama' &&
        currentPlan &&
        !isModelAllowedForTier(defaultModel, normalizeSubscriptionTier(currentPlan))
      ) {
        await modelStore.selectModel('auto-economy', 'managed_cloud');
      } else {
        await modelStore.selectModel(defaultModel, defaultProvider);
      }
    }
  } catch (error) {
    console.error('Failed to initialize model store from settings:', error);
  }
};

/**
 * Get the best auto mode for a given tier.
 * Max/Enterprise → Premium, Pro → Balanced, Hobby/Free → Economy
 */
export const getBestAutoModeForTier = (tier: string): string => {
  return getBestAutoModeForSubscriptionTier(tier);
};

export const resolveEffectiveModelForTier = (
  selectedModel: string | null,
  tier: string | null | undefined,
): string => {
  return selectedModel || getBestAutoModeForSubscriptionTier(tier ?? 'hobby');
};

/**
 * Enforce tier-appropriate model selection.
 * Called when user's plan tier changes to ensure they're using an allowed auto mode.
 *
 * Behavior:
 * - In Simple Mode: Automatically selects the BEST auto mode for the tier
 * - In Advanced Mode: Only downgrades if using an auto mode above their tier
 *
 * Tier restrictions:
 * - hobby/free/none: Only 'auto-economy' allowed
 * - pro: 'auto-economy' or 'auto-balanced' allowed
 * - max/enterprise: All auto modes allowed
 */
// [C1 fix] Re-entrancy guard: prevents concurrent plan-change events from corrupting tier state
let _isEnforcingTier = false;

export const enforceModelTierRestriction = (planTier: string | null): void => {
  // [C1 fix] Skip if already enforcing to prevent race conditions on rapid plan changes
  if (_isEnforcingTier) return;
  _isEnforcingTier = true;

  const modelStore = useModelStore.getState();
  const { selectedModel, selectedProvider, selectModel } = modelStore;

  const normalizedTier = normalizeSubscriptionTier(planTier) as SubscriptionTier;
  const allowed = getAllowedAutoModesForTier(normalizedTier);

  // Check if user is in Simple Mode (dynamic import to avoid circular deps)
  import('./ui')
    .then(async ({ useUIStore }) => {
      const isSimpleMode = useUIStore.getState().mode === 'simple';
      const selectedMetadata = selectedModel ? getModelMetadata(selectedModel) : null;
      const isAutoSelection = selectedModel === 'auto' || selectedModel?.startsWith('auto');
      const isOllamaSelection =
        selectedProvider === 'ollama' || selectedMetadata?.provider === 'ollama';

      if (isSimpleMode) {
        // In Simple Mode: Always use the BEST auto mode for the tier
        const bestAutoMode = getBestAutoModeForTier(normalizedTier);
        if (selectedModel !== bestAutoMode) {
          console.debug(
            `[ModelStore] Simple Mode: Setting ${normalizedTier} tier to best auto mode: ${bestAutoMode}`,
          );
          // Await selectModel so the reentrancy guard holds until selection completes
          await selectModel(bestAutoMode, 'managed_cloud');
        }
      } else {
        // In Advanced Mode: Only downgrade if using an auto mode they shouldn't have
        if (isAutoSelection && selectedModel && !allowed.includes(selectedModel)) {
          console.debug(
            `[ModelStore] Enforcing tier restriction: ${normalizedTier} tier cannot use ${selectedModel}, switching to auto-economy`,
          );
          await selectModel('auto-economy', 'managed_cloud');
        } else if (
          selectedModel &&
          !isAutoSelection &&
          !isOllamaSelection &&
          !isModelAllowedForTier(selectedModel, normalizedTier)
        ) {
          console.debug(
            `[ModelStore] Enforcing tier restriction: ${normalizedTier} tier cannot use ${selectedModel}, switching to auto-economy`,
          );
          await selectModel('auto-economy', 'managed_cloud');
        }
      }
    })
    .catch(async (err) => {
      console.error('[ModelStore] enforceModelTierRestriction failed:', err);
      // [C1 fix] Fail-safe: on error, fall back to the lowest tier model
      await selectModel('auto-economy', 'managed_cloud');
    })
    .finally(() => {
      // [C1 fix] Always release the lock so future plan changes are processed
      _isEnforcingTier = false;
    });
};

// [C3 fix] Module-level unsubscribe reference prevents listener accumulation on HMR reload
let _unsubscribePlanChanges: (() => void) | null = null;

// Subscribe to auth store plan changes to enforce tier restrictions
// This runs when the user's plan tier is loaded/changed
if (typeof window !== 'undefined') {
  // Dynamic import to avoid circular dependencies
  import('./auth')
    .then(({ useUnifiedAuthStore }) => {
      // Guard against undefined in test environments where auth store may not be properly initialized
      if (useUnifiedAuthStore?.subscribe) {
        // [C3 fix] Clean up previous subscription before creating a new one (HMR safety)
        _unsubscribePlanChanges?.();
        _unsubscribePlanChanges = useUnifiedAuthStore.subscribe(
          (state) => state.plan,
          (plan) => {
            const normalizedPlan = plan ?? 'free';
            console.debug(
              `[ModelStore] Plan changed to ${normalizedPlan}, enforcing model tier restriction`,
            );
            enforceModelTierRestriction(normalizedPlan);
          },
        );
        const initialPlan = useUnifiedAuthStore.getState().plan ?? 'free';
        console.debug(
          `[ModelStore] Initial plan is ${initialPlan}, enforcing model tier restriction`,
        );
        enforceModelTierRestriction(initialPlan);
      }
    })
    .catch((err) => {
      console.warn('[ModelStore] Failed to load auth for plan subscription:', err);
    });
}

// ---------------------------------------------------------------------------
// Subscribe to app mode + plan tier changes to reload the model list.
// When switching to cloud mode: populate cloudModels with managed models.
// When switching to local mode: clear cloudModels (BYOK list used instead).
// Module-level ref prevents subscription accumulation on HMR reload.
// ---------------------------------------------------------------------------

let _unsubscribeAppMode: (() => void) | null = null;

if (typeof window !== 'undefined') {
  import('./appModeStore')
    .then(({ useAppModeStore }) => {
      _unsubscribeAppMode?.();
      // Initial load
      const { mode, planTier } = useAppModeStore.getState();
      useModelStore.getState().loadModelsForMode(mode, planTier);

      // Subscribe to both mode and planTier changes
      _unsubscribeAppMode = useAppModeStore.subscribe(
        (state) => ({ mode: state.mode, planTier: state.planTier }),
        ({ mode: newMode, planTier: newTier }) => {
          console.debug(`[ModelStore] App mode/tier changed: mode=${newMode} tier=${newTier}`);
          useModelStore.getState().loadModelsForMode(newMode, newTier);
        },
        { equalityFn: (a, b) => a.mode === b.mode && a.planTier === b.planTier },
      );
    })
    .catch((err) => {
      console.warn('[ModelStore] Failed to subscribe to app mode changes:', err);
    });
}
