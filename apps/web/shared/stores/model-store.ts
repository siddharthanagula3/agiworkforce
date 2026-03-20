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
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'OpenAI',
    description: 'Most capable GPT model for complex tasks',
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'OpenAI',
    description: 'Fast and affordable for everyday tasks',
  },
  {
    id: 'o1',
    name: 'o1',
    provider: 'OpenAI',
    description: 'Advanced reasoning model for complex problems',
  },
  {
    id: 'o3-mini',
    name: 'o3 Mini',
    provider: 'OpenAI',
    description: 'Fast reasoning model for STEM tasks',
  },
  {
    id: 'o4-mini',
    name: 'o4 Mini',
    provider: 'OpenAI',
    description: 'Latest efficient reasoning model',
  },

  // Anthropic
  // Model IDs use hyphen format (claude-opus-4-6) matching Anthropic API conventions
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'Anthropic',
    description: 'Most intelligent Claude model',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: 'Balanced intelligence and speed',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fastest Claude model for everyday tasks',
  },

  // Google
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'Google',
    description: 'Most advanced Gemini with 1M context',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    description: 'Fast multimodal model with 1M context',
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: 'Google',
    description: 'Most cost-efficient Gemini model',
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
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    description: 'Cost-effective general chat model',
  },

  // Perplexity
  {
    id: 'sonar-pro',
    name: 'Perplexity Sonar Pro',
    provider: 'Perplexity',
    description: 'Advanced search-augmented reasoning',
  },
  {
    id: 'sonar',
    name: 'Perplexity Sonar',
    provider: 'Perplexity',
    description: 'Search-augmented AI with web access',
  },

  // xAI
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xAI',
    description: 'Most capable Grok model',
  },
  {
    id: 'grok-2',
    name: 'Grok 2',
    provider: 'xAI',
    description: 'Real-time knowledge with wit and depth',
  },

  // Mistral
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'Mistral',
    description: 'Top-tier reasoning model',
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: 'Mistral',
    description: 'Lightweight and fast model',
  },
];

interface ModelState {
  selectedModelId: string;
  thinkingEnabled: boolean;
  /** Token budget for extended thinking (0 = off). Mirrors desktop thinkingBudget. */
  thinkingBudget: number;
  setSelectedModelId: (id: string) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  /** Set thinking budget in tokens (0 = disabled). Auto-enables thinkingEnabled when > 0. */
  setThinkingBudget: (budget: number) => void;
  getSelectedModel: () => AIModel;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      selectedModelId: 'claude-sonnet-4-6',
      thinkingEnabled: false,
      thinkingBudget: 0,

      setSelectedModelId: (id: string) => {
        set({ selectedModelId: id });
      },

      setThinkingEnabled: (enabled: boolean) => {
        set({ thinkingEnabled: enabled });
      },

      setThinkingBudget: (budget: number) => {
        set({ thinkingBudget: budget, thinkingEnabled: budget > 0 });
      },

      getSelectedModel: () => {
        const { selectedModelId } = get();
        return AVAILABLE_MODELS.find((m) => m.id === selectedModelId) || AVAILABLE_MODELS[0]!;
      },
    }),
    {
      name: 'agi-model-store',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // v1 -> v2: add thinkingBudget field
        if (version < 2) {
          const state = persistedState as Partial<ModelState>;
          return { ...state, thinkingBudget: 0 };
        }
        return persistedState as ModelState;
      },
    },
  ),
);
