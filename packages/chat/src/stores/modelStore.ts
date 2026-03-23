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

const DEFAULT_MODEL_ID = 'claude-sonnet-4.6';

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
        return models.find((m) => m.id === selectedModelId);
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
