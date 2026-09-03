import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelInfo } from '../lib/types';
import {
  getModelMetadataById,
  getAutoRoutingProfiles,
  getProviderDefaultModel,
  getTaskModelForProvider,
  type Provider,
} from '@agiworkforce/types';
import type { RoutingDecision } from '@agiworkforce/types';
import { getAutoCapabilityEnvelope } from '@agiworkforce/routing';

interface ModelState {
  models: ModelInfo[];
  selectedModelId: string;
  modelCatalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  modelCatalogError: string | null;
  thinkingEnabled: boolean;
  recentModelIds: string[];
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
  const envelope = getAutoCapabilityEnvelope({
    selection: profile.id,
    subscriptionTier: tier.subscription,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  // No dispatchable route means there is nothing honest to advertise; the row is
  // dropped rather than rendered as a model that supports nothing.
  if (!envelope) return [];

  return [
    {
      id: profile.id,
      name: profile.label,
      provider: 'managed_cloud',
      tier: tier.presentation,
      supportsThinking: envelope.supportsThinking,
      supportsVision: envelope.supportsVision,
      supportsTools: envelope.supportsTools,
      contextWindow: envelope.contextWindow,
      isLocal: false,
      isByok: false,
    },
  ];
});

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
          return { selectedModelId: id, recentModelIds: recentIds, lastRoutingDecision: null };
        }),

      toggleThinking: () => set((state) => ({ thinkingEnabled: !state.thinkingEnabled })),

      setThinking: (enabled) => set({ thinkingEnabled: enabled }),

      setRoutingDecision: (decision) => set({ lastRoutingDecision: decision }),

      clearRoutingDecision: () => set({ lastRoutingDecision: null }),

      getSelectedModel: () => {
        const { models, selectedModelId } = get();
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
