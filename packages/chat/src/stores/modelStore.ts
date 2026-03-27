import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelInfo } from '../lib/types';
import {
  getModelMetadataById,
  getProviderDefaultModel,
  getTaskModelForProvider,
  type Provider,
} from '@agiworkforce/types';

interface ModelState {
  models: ModelInfo[];
  selectedModelId: string;
  thinkingEnabled: boolean;
  recentModelIds: string[];

  setModels: (models: ModelInfo[]) => void;
  selectModel: (id: string) => void;
  toggleThinking: () => void;
  setThinking: (enabled: boolean) => void;
  getSelectedModel: () => ModelInfo | undefined;
  getModelsByTier: () => Record<string, ModelInfo[]>;
}

const DEFAULT_MODEL_ID = 'auto-economy';

function toModelTier(provider: Provider | string, modelId: string): ModelInfo['tier'] {
  if (modelId === getTaskModelForProvider(provider, 'fast_completion')) {
    return 'fast';
  }

  if (modelId === getProviderDefaultModel(provider)) {
    return 'standard';
  }

  return 'flagship';
}

function buildFallbackModel(provider: Provider, modelId: string | null): ModelInfo | null {
  const metadata = getModelMetadataById(modelId);
  if (!metadata) {
    return null;
  }

  return {
    id: metadata.id,
    name: metadata.name,
    provider: metadata.provider,
    tier: toModelTier(provider, metadata.id),
    supportsThinking: metadata.capabilities.thinking,
    supportsVision: metadata.capabilities.vision,
    supportsTools: metadata.capabilities.tools,
    contextWindow: metadata.contextWindow,
    isLocal: false,
    isByok: false,
  };
}

const CORE_CLOUD_PROVIDERS: Provider[] = ['anthropic', 'openai', 'google'];

const AUTO_MODE_FALLBACKS: ModelInfo[] = [
  {
    id: 'auto-economy',
    name: 'Auto Economy',
    provider: 'managed_cloud',
    tier: 'fast',
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'auto-balanced',
    name: 'Auto Balanced',
    provider: 'managed_cloud',
    tier: 'standard',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'auto-premium',
    name: 'Auto Premium',
    provider: 'managed_cloud',
    tier: 'flagship',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 400000,
    isLocal: false,
    isByok: false,
  },
];

/** Hobby-tier cloud models — auto-routing + specific agentic models.
 * Desktop and web can override these via setModels() with the full catalog. */
export const CLOUD_FALLBACK_MODELS: ModelInfo[] = [
  ...AUTO_MODE_FALLBACKS,
  ...CORE_CLOUD_PROVIDERS.flatMap((provider) => {
    const model = buildFallbackModel(
      provider,
      getTaskModelForProvider(provider, 'fast_completion'),
    );
    return model ? [model] : [];
  }),
];

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      models: [],
      selectedModelId: DEFAULT_MODEL_ID,
      thinkingEnabled: false,
      recentModelIds: [],

      setModels: (models) => set({ models }),

      selectModel: (id) =>
        set((state) => {
          const recentIds = [id, ...state.recentModelIds.filter((r) => r !== id)].slice(0, 5);
          return { selectedModelId: id, recentModelIds: recentIds };
        }),

      toggleThinking: () => set((state) => ({ thinkingEnabled: !state.thinkingEnabled })),

      setThinking: (enabled) => set({ thinkingEnabled: enabled }),

      getSelectedModel: () => {
        const { models, selectedModelId } = get();
        // Check store models first, then fallback for web mode
        return (
          models.find((m) => m.id === selectedModelId) ??
          CLOUD_FALLBACK_MODELS.find((m) => m.id === selectedModelId)
        );
      },

      getModelsByTier: () => {
        const { models } = get();
        const tiers: Record<string, ModelInfo[]> = {};
        for (const model of models) {
          const tier = model.tier;
          if (!tiers[tier]) tiers[tier] = [];
          tiers[tier]!.push(model);
        }
        return tiers;
      },
    }),
    {
      name: 'chat-model-store',
      partialize: (state) => ({
        selectedModelId: state.selectedModelId,
        thinkingEnabled: state.thinkingEnabled,
        recentModelIds: state.recentModelIds,
      }),
    },
  ),
);
