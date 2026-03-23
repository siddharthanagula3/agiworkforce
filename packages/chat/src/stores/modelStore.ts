import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModelInfo } from '../lib/types';

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

/** Hobby-tier cloud models — auto-routing + specific agentic models.
 *  Desktop overrides via setModels() with the full catalog. */
export const CLOUD_FALLBACK_MODELS: ModelInfo[] = [
  // Auto-routing tiers (backend maps to best model for plan)
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
  // Specific agentic models — hobby-tier accessible (economy set)
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'fast',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 200000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    tier: 'fast',
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 128000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    tier: 'fast',
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    contextWindow: 1000000,
    isLocal: false,
    isByok: false,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    tier: 'standard',
    supportsThinking: false,
    supportsVision: false,
    supportsTools: true,
    contextWindow: 128000,
    isLocal: false,
    isByok: false,
  },
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
