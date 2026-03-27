'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RoutingDecision, RoutingTaskType } from '@agiworkforce/types';
import {
  MODEL_PRESETS,
  PROVIDER_LABELS,
  getModelMetadata,
  normalizeModelId,
  type ModelMetadata,
} from '@/constants/llm';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  providerKey: string;
  description: string;
}

export type { RoutingDecision, RoutingTaskType };

type PersistedModelState = {
  selectedModelId: string;
  selectedProvider: string | null;
  thinkingEnabled: boolean;
  thinkingBudget: number;
};

interface ModelState extends PersistedModelState {
  selectedModel: string;
  thinkingModeEnabled: boolean;
  availableModels: AIModel[];
  loading: boolean;
  lastRoutingDecision: RoutingDecision | null;
  setSelectedModelId: (id: string) => void;
  setSelectedModel: (id: string, provider?: string | null) => void;
  selectModel: (id: string, provider?: string | null) => Promise<void>;
  setSelectedProvider: (provider: string | null) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setThinkingModeEnabled: (enabled: boolean) => void;
  setThinkingBudget: (budget: number) => void;
  getSelectedModel: () => AIModel;
  getAvailableModels: () => Promise<AIModel[]>;
  setLastRoutingDecision: (decision: RoutingDecision | null) => void;
}

const CHAT_MODEL_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal']);
const AUTO_MODE_DESCRIPTIONS: Record<string, string> = {
  'auto-economy': 'Fastest, most cost-effective',
  'auto-balanced': 'Best default for most conversations',
  'auto-premium': 'Maximum quality when needed',
};

function describeModel(metadata: ModelMetadata): string {
  const bestFor = metadata.bestFor?.slice(0, 2).join(' · ');
  if (bestFor) {
    return bestFor;
  }
  if (metadata.qualityTier === 'best') {
    return 'Highest capability';
  }
  if (metadata.qualityTier === 'balanced') {
    return 'Balanced quality and speed';
  }
  return 'Fast and cost-efficient';
}

function buildAvailableModels(): AIModel[] {
  const seen = new Set<string>();
  const autoModeEntries = (MODEL_PRESETS['managed_cloud'] ?? []).map((entry) => ({
    id: entry.value,
    name: entry.label,
    provider: PROVIDER_LABELS['managed_cloud'] ?? 'Managed Cloud',
    providerKey: 'managed_cloud',
    description: AUTO_MODE_DESCRIPTIONS[entry.value] ?? 'Best model selected automatically',
  }));
  const orderedIds = Object.entries(MODEL_PRESETS)
    .filter(([provider]) => provider !== 'managed_cloud')
    .flatMap(([, entries]) => entries.map((entry) => entry.value));

  const manualEntries = orderedIds
    .filter((modelId) => {
      if (seen.has(modelId)) {
        return false;
      }
      seen.add(modelId);
      return true;
    })
    .map((modelId) => getModelMetadata(modelId))
    .filter(
      (metadata): metadata is ModelMetadata =>
        !!metadata && CHAT_MODEL_TYPES.has(metadata.modelType),
    )
    .map((metadata) => ({
      id: metadata.id,
      name: metadata.name,
      provider: PROVIDER_LABELS[metadata.provider] ?? metadata.provider,
      providerKey: metadata.provider,
      description: describeModel(metadata),
    }));

  return [...autoModeEntries, ...manualEntries];
}

export const AVAILABLE_MODELS: AIModel[] = buildAvailableModels();

const DEFAULT_MODEL_ID =
  AVAILABLE_MODELS.find((model) => model.id === 'auto-balanced')?.id ??
  AVAILABLE_MODELS[0]?.id ??
  'auto-balanced';

function resolveProvider(modelId: string, explicitProvider?: string | null): string | null {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  if (explicitProvider) {
    return explicitProvider;
  }
  return getModelMetadata(canonicalModelId)?.provider ?? null;
}

function applyModelSelection(
  modelId: string,
  explicitProvider?: string | null,
): Pick<
  ModelState,
  | 'selectedModelId'
  | 'selectedModel'
  | 'selectedProvider'
  | 'thinkingEnabled'
  | 'thinkingModeEnabled'
> {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  const metadata = getModelMetadata(canonicalModelId);
  const provider = resolveProvider(canonicalModelId, explicitProvider);
  const supportsThinking = metadata?.capabilities?.thinking ?? false;

  return {
    selectedModelId: canonicalModelId,
    selectedModel: canonicalModelId,
    selectedProvider: provider,
    thinkingEnabled: supportsThinking,
    thinkingModeEnabled: supportsThinking,
  };
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      ...applyModelSelection(DEFAULT_MODEL_ID),
      thinkingBudget: 0,
      availableModels: AVAILABLE_MODELS,
      loading: false,
      lastRoutingDecision: null,

      setSelectedModelId: (id) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id),
        }));
      },

      setSelectedModel: (id, provider) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id, provider),
        }));
      },

      selectModel: async (id, provider) => {
        set((state) => ({
          ...state,
          ...applyModelSelection(id, provider),
        }));
      },

      setSelectedProvider: (provider) => {
        set({ selectedProvider: provider });
      },

      setThinkingEnabled: (enabled) => {
        set({ thinkingEnabled: enabled, thinkingModeEnabled: enabled });
      },

      setThinkingModeEnabled: (enabled) => {
        set({ thinkingEnabled: enabled, thinkingModeEnabled: enabled });
      },

      setThinkingBudget: (budget) => {
        const supportsThinking =
          getModelMetadata(get().selectedModelId)?.capabilities?.thinking ?? false;
        set({
          thinkingBudget: budget,
          thinkingEnabled: supportsThinking && budget > 0,
          thinkingModeEnabled: supportsThinking && budget > 0,
        });
      },

      getSelectedModel: () => {
        const { selectedModelId } = get();
        return (
          AVAILABLE_MODELS.find((model) => model.id === selectedModelId) ?? AVAILABLE_MODELS[0]!
        );
      },

      getAvailableModels: async () => AVAILABLE_MODELS,

      setLastRoutingDecision: (decision) => {
        set({ lastRoutingDecision: decision });
      },
    }),
    {
      name: 'agi-model-store',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedModelState => ({
        selectedModelId: state.selectedModelId,
        selectedProvider: state.selectedProvider,
        thinkingEnabled: state.thinkingEnabled,
        thinkingBudget: state.thinkingBudget,
      }),
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<PersistedModelState>) ?? {};
        const selectedModelId =
          normalizeModelId(state.selectedModelId) ?? state.selectedModelId ?? DEFAULT_MODEL_ID;
        return {
          selectedModelId,
          selectedProvider: state.selectedProvider ?? resolveProvider(selectedModelId),
          thinkingEnabled: state.thinkingEnabled ?? false,
          thinkingBudget: state.thinkingBudget ?? 0,
        };
      },
    },
  ),
);
