'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export const AVAILABLE_MODELS: AIModel[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Most capable GPT model for complex tasks',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Fast and affordable for everyday tasks',
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'High-capability model with 128k context',
  },
  {
    id: 'o1',
    name: 'o1',
    provider: 'OpenAI',
    description: 'Advanced reasoning model for complex problems',
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    provider: 'OpenAI',
    description: 'Fast reasoning model for STEM tasks',
  },

  // Anthropic
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    description: 'Balanced intelligence and speed',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Strong general-purpose model',
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    description: 'Fastest and most compact Claude model',
  },

  // Google
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description: 'Fast multimodal model with 1M context',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    description: 'Advanced model with 2M token context',
  },

  // DeepSeek
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    description: 'Reasoning model rivaling top competitors',
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'DeepSeek',
    description: 'Cost-effective general chat model',
  },

  // Perplexity
  {
    id: 'sonar',
    name: 'Perplexity Sonar',
    provider: 'Perplexity',
    description: 'Search-augmented AI with web access',
  },
  {
    id: 'sonar-pro',
    name: 'Perplexity Sonar Pro',
    provider: 'Perplexity',
    description: 'Advanced search-augmented reasoning',
  },

  // xAI
  {
    id: 'grok-2',
    name: 'Grok 2',
    provider: 'xAI',
    description: 'Real-time knowledge with wit and depth',
  },
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
