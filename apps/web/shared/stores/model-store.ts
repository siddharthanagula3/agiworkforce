'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
}

export const AVAILABLE_MODELS: AIModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'DeepSeek' },
  { id: 'sonar', name: 'Perplexity Sonar', provider: 'Perplexity' },
];

interface ModelState {
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  getSelectedModel: () => AIModel;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModelId: 'gpt-4o',

      setSelectedModelId: (id: string) => {
        set({ selectedModelId: id });
      },

      getSelectedModel: () => {
        const { selectedModelId } = get();
        return AVAILABLE_MODELS.find((m) => m.id === selectedModelId) || AVAILABLE_MODELS[0];
      },
    }),
    {
      name: 'agi-model-store',
      version: 1,
    },
  ),
);
