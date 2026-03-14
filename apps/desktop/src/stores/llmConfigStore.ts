/**
 * LLM Config Store
 *
 * Manages LLM provider configuration, model selection, task routing,
 * and favorite models. Includes plan-based enforcement of task routing.
 *
 * Middleware: devtools(persist(subscribeWithSelector(...)))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { getSimpleErrorMessage } from '../lib/errorMessages';
import { storageFallback } from '../lib/storageFallback';
import {
  getAllowedAutoModesForTier,
  getModelMetadata,
  isModelAllowedForTier,
  normalizeSubscriptionTier,
} from '../constants/llm';

import type { Provider } from '../types/provider';
import type { CustomModelConfig } from '../types/customModel';
import type { SubscriptionTier } from '../constants/planModels';

// ============================================================================
// Types
// ============================================================================

export type TaskCategory = 'search' | 'code' | 'docs' | 'chat' | 'vision' | 'image' | 'video';

/** Effort level for adaptive thinking on Claude Opus 4.6+.
 *  - `low`    – minimal reasoning, fastest / cheapest
 *  - `medium` – balanced reasoning (default)
 *  - `high`   – deep reasoning ("think hard")
 *  - `max`    – maximum reasoning ("ultrathink")
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

export interface TaskRouting {
  search: { provider: Provider; model: string };
  code: { provider: Provider; model: string };
  docs: { provider: Provider; model: string };
  chat: { provider: Provider; model: string };
  vision: { provider: Provider; model: string };
  image: { provider: Provider; model: string };
  video: { provider: Provider; model: string };
}

export interface LLMConfig {
  defaultProvider: Provider;
  temperature: number;
  maxTokens: number;
  defaultModels: {
    ollama: string;
    managed_cloud: string;
  };
  taskRouting: TaskRouting;
  favoriteModels: string[];
  /** Effort level for adaptive thinking (Claude Opus 4.6+). Default: 'medium'. */
  effortLevel: EffortLevel;
}

interface LLMConfigState {
  llmConfig: LLMConfig;
  customModels: CustomModelConfig[];
  error: string | null;
}

interface LLMConfigActions {
  setDefaultProvider: (provider: Provider) => Promise<void>;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setDefaultModel: (provider: Provider, model: string) => void;
  setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => void;
  setFavoriteModels: (models: string[]) => void;
  addFavoriteModel: (model: string) => void;
  removeFavoriteModel: (model: string) => void;
  addCustomModel: (config: CustomModelConfig) => void;
  updateCustomModel: (id: string, config: CustomModelConfig) => void;
  removeCustomModel: (id: string) => void;
  setEffortLevel: (level: EffortLevel) => void;
}

export type LLMConfigStore = LLMConfigState & LLMConfigActions;

// ============================================================================
// Defaults
// ============================================================================

export const defaultLLMConfig: LLMConfig = {
  defaultProvider: 'managed_cloud',
  temperature: 0.7,
  maxTokens: 4096,
  defaultModels: {
    ollama: '',
    managed_cloud: 'auto',
  },
  favoriteModels: [],
  effortLevel: 'medium',
  taskRouting: {
    search: { provider: 'managed_cloud', model: 'auto' },
    code: { provider: 'managed_cloud', model: 'auto' },
    docs: { provider: 'managed_cloud', model: 'auto' },
    chat: { provider: 'managed_cloud', model: 'auto' },
    vision: { provider: 'managed_cloud', model: 'auto' },
    image: { provider: 'managed_cloud', model: 'auto' },
    video: { provider: 'managed_cloud', model: 'auto' },
  },
};

export const createDefaultLLMConfig = (): LLMConfig => ({
  ...defaultLLMConfig,
  defaultModels: { ...defaultLLMConfig.defaultModels },
  taskRouting: { ...defaultLLMConfig.taskRouting },
  favoriteModels: [],
});

// ============================================================================
// Tier enforcement
// ============================================================================

export function isTaskRoutingModelAllowedForTier(
  category: TaskCategory,
  modelId: string,
  tier: SubscriptionTier | string | null | undefined,
): boolean {
  if (!modelId || modelId === 'auto') return true;
  if (modelId.startsWith('auto')) return getAllowedAutoModesForTier(tier).includes(modelId);
  if (category === 'image' || category === 'video') return true;

  const metadata = getModelMetadata(modelId);
  if (metadata?.provider === 'ollama') return true;

  const normalizedTier = normalizeSubscriptionTier(tier);
  return isModelAllowedForTier(modelId, normalizedTier);
}

export const enforceTaskRoutingTierRestriction = (planTier: string | null): void => {
  const normalizedTier = normalizeSubscriptionTier(planTier);
  const { llmConfig, setTaskRouting } = useLLMConfigStore.getState();

  (
    Object.entries(llmConfig.taskRouting) as Array<[TaskCategory, TaskRouting[TaskCategory]]>
  ).forEach(([category, route]) => {
    if (isTaskRoutingModelAllowedForTier(category, route.model, normalizedTier)) return;

    console.debug(
      `[LLMConfigStore] Enforcing task routing restriction: ${normalizedTier} tier cannot use ${route.model} for ${category}, switching to auto`,
    );
    setTaskRouting(category, 'managed_cloud', 'auto');
  });
};

// ============================================================================
// Store
// ============================================================================

export const useLLMConfigStore = create<LLMConfigStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        llmConfig: { ...defaultLLMConfig },
        customModels: [],
        error: null,

        setDefaultProvider: async (provider: Provider) => {
          try {
            await invoke('llm_set_default_provider', { provider });
            set(
              (state) => ({ llmConfig: { ...state.llmConfig, defaultProvider: provider } }),
              undefined,
              'llmConfig/setDefaultProvider',
            );
          } catch (error) {
            console.error('Failed to set default provider:', error);
            set(
              { error: getSimpleErrorMessage(error) },
              undefined,
              'llmConfig/setDefaultProvider/error',
            );
            throw error;
          }
        },

        setTemperature: (temperature: number) => {
          set(
            (state) => ({ llmConfig: { ...state.llmConfig, temperature } }),
            undefined,
            'llmConfig/setTemperature',
          );
        },

        setMaxTokens: (maxTokens: number) => {
          set(
            (state) => ({ llmConfig: { ...state.llmConfig, maxTokens } }),
            undefined,
            'llmConfig/setMaxTokens',
          );
        },

        setDefaultModel: (provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                defaultModels: { ...state.llmConfig.defaultModels, [provider]: model },
              },
            }),
            undefined,
            'llmConfig/setDefaultModel',
          );
        },

        setTaskRouting: (category: TaskCategory, provider: Provider, model: string) => {
          set(
            (state) => ({
              llmConfig: {
                ...state.llmConfig,
                taskRouting: {
                  ...state.llmConfig.taskRouting,
                  [category]: { provider, model },
                },
              },
            }),
            undefined,
            'llmConfig/setTaskRouting',
          );
        },

        setFavoriteModels: (models: string[]) => {
          set(
            (state) => ({ llmConfig: { ...state.llmConfig, favoriteModels: models } }),
            undefined,
            'llmConfig/setFavoriteModels',
          );
        },

        addFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = [...state.llmConfig.favoriteModels];
              if (!favoriteModels.includes(model)) favoriteModels.push(model);
              return { llmConfig: { ...state.llmConfig, favoriteModels } };
            },
            undefined,
            'llmConfig/addFavoriteModel',
          );
        },

        removeFavoriteModel: (model: string) => {
          set(
            (state) => {
              const favoriteModels = state.llmConfig.favoriteModels.filter((m) => m !== model);
              return { llmConfig: { ...state.llmConfig, favoriteModels } };
            },
            undefined,
            'llmConfig/removeFavoriteModel',
          );
        },

        addCustomModel: (config: CustomModelConfig) => {
          set(
            (state) => ({ customModels: [...state.customModels, config] }),
            undefined,
            'llmConfig/addCustomModel',
          );
        },

        updateCustomModel: (id: string, config: CustomModelConfig) => {
          set(
            (state) => ({
              customModels: state.customModels.map((m) => (m.id === id ? config : m)),
            }),
            undefined,
            'llmConfig/updateCustomModel',
          );
        },

        removeCustomModel: (id: string) => {
          set(
            (state) => ({ customModels: state.customModels.filter((m) => m.id !== id) }),
            undefined,
            'llmConfig/removeCustomModel',
          );
        },

        setEffortLevel: (level: EffortLevel) => {
          set(
            (state) => ({ llmConfig: { ...state.llmConfig, effortLevel: level } }),
            undefined,
            'llmConfig/setEffortLevel',
          );
        },
      })),
      {
        name: 'agiworkforce-llm-config',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          llmConfig: state.llmConfig,
          customModels: state.customModels,
        }),
      },
    ),
    { name: 'LLMConfigStore', enabled: import.meta.env.DEV },
  ),
);

let hasInitializedPlanSubscription = false;

async function initializePlanSubscription(): Promise<void> {
  if (hasInitializedPlanSubscription || typeof window === 'undefined') {
    return;
  }

  hasInitializedPlanSubscription = true;

  try {
    const { useUnifiedAuthStore } = await import('./auth');
    if (!useUnifiedAuthStore?.subscribe) {
      return;
    }

    useUnifiedAuthStore.subscribe(
      (state) => state.plan,
      (plan) => {
        enforceTaskRoutingTierRestriction(plan ?? 'free');
      },
    );
    enforceTaskRoutingTierRestriction(useUnifiedAuthStore.getState().plan ?? 'free');
  } catch (err) {
    hasInitializedPlanSubscription = false;
    console.warn('[llmConfigStore] Failed to load auth for plan subscription:', err);
  }
}

if (typeof window !== 'undefined') {
  void initializePlanSubscription();
}
