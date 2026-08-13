import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelInfo } from '../lib/types';
import {
  getModelMetadataById,
  getAutoRoutingProfiles,
  getProviderDefaultModel,
  getTaskModelForProvider,
  resolveAutoModeModel,
  type Provider,
} from '@agiworkforce/types';
import type { RoutingDecision } from '@agiworkforce/types';

interface ModelState {
  models: ModelInfo[];
  selectedModelId: string;
  /**
   * Host-owned reachability lifecycle. `models: []` alone cannot distinguish
   * an in-progress local-runtime probe from a verified empty catalog.
   * This state is deliberately not persisted: every app launch must verify
   * the active execution boundary again.
   */
  modelCatalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  modelCatalogError: string | null;
  thinkingEnabled: boolean;
  recentModelIds: string[];
  /** Last auto-routing decision — shown as a badge in the model selector. */
  lastRoutingDecision: RoutingDecision | null;

  setModels: (models: ModelInfo[]) => void;
  beginModelCatalogLoad: (clearExisting: boolean) => void;
  completeModelCatalogLoad: (models: ModelInfo[], selectedModelId: string) => void;
  failModelCatalogLoad: (message: string, clearExisting: boolean) => void;
  selectModel: (id: string) => void;
  toggleThinking: () => void;
  setThinking: (enabled: boolean) => void;
  getSelectedModel: () => ModelInfo | undefined;
  getModelsByTier: () => Record<string, ModelInfo[]>;
  setRoutingDecision: (decision: RoutingDecision) => void;
  clearRoutingDecision: () => void;
}

export const selectLastRoutingDecision = (s: ModelState) => s.lastRoutingDecision;

const AUTO_ROUTING_PROFILES = getAutoRoutingProfiles();
const DEFAULT_MODEL_ID = AUTO_ROUTING_PROFILES[0]?.id ?? 'auto';

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
  // Unified Chat uses token context for chat compaction and presentation.
  // Specialized media models may honestly omit this inapplicable field, so a
  // row without a published token limit cannot become a chat fallback.
  if (!metadata || metadata.contextWindow === undefined) {
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

const AUTO_PROFILE_TIER = {
  economy: { subscription: 'free', presentation: 'fast' },
  balanced: { subscription: 'pro', presentation: 'standard' },
  premium: { subscription: 'max', presentation: 'flagship' },
} as const;

const AUTO_MODE_FALLBACKS: ModelInfo[] = AUTO_ROUTING_PROFILES.flatMap((profile) => {
  const tier = AUTO_PROFILE_TIER[profile.profile];
  const representativeId = resolveAutoModeModel(profile.id, tier.subscription, 'general');
  const metadata = getModelMetadataById(representativeId);
  if (!metadata || metadata.contextWindow === undefined) return [];

  return [
    {
      id: profile.id,
      name: profile.label,
      provider: 'managed_cloud',
      tier: tier.presentation,
      supportsThinking: metadata.capabilities.thinking,
      supportsVision: metadata.capabilities.vision,
      supportsTools: metadata.capabilities.tools,
      contextWindow: metadata.contextWindow,
      isLocal: false,
      isByok: false,
    },
  ];
});

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
      modelCatalogStatus: 'ready',
      modelCatalogError: null,
      thinkingEnabled: false,
      recentModelIds: [],
      lastRoutingDecision: null,

      // Existing hosts that publish a complete catalog through `setModels`
      // retain their historical ready-state behavior.
      setModels: (models) => set({ models, modelCatalogStatus: 'ready', modelCatalogError: null }),

      beginModelCatalogLoad: (clearExisting) =>
        set({
          ...(clearExisting
            ? {
                models: [],
                selectedModelId: '',
                lastRoutingDecision: null,
              }
            : {}),
          modelCatalogStatus: 'loading',
          modelCatalogError: null,
          // Retain the last verified same-boundary catalog during refresh.
          // A Local/Cloud boundary change always passes clearExisting=true.
        }),

      completeModelCatalogLoad: (models, selectedModelId) =>
        set({
          models,
          selectedModelId,
          modelCatalogStatus: 'ready',
          modelCatalogError: null,
        }),

      failModelCatalogLoad: (message, clearExisting) =>
        set({
          ...(clearExisting
            ? {
                models: [],
                selectedModelId: '',
                lastRoutingDecision: null,
              }
            : {}),
          modelCatalogStatus: 'error',
          modelCatalogError: message,
        }),

      selectModel: (id) =>
        set((state) => {
          const recentIds = [id, ...state.recentModelIds.filter((r) => r !== id)].slice(0, 5);
          // Clear routing decision when user manually picks a model
          return { selectedModelId: id, recentModelIds: recentIds, lastRoutingDecision: null };
        }),

      toggleThinking: () => set((state) => ({ thinkingEnabled: !state.thinkingEnabled })),

      setThinking: (enabled) => set({ thinkingEnabled: enabled }),

      setRoutingDecision: (decision) => set({ lastRoutingDecision: decision }),

      clearRoutingDecision: () => set({ lastRoutingDecision: null }),

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
