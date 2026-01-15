import type { Provider } from '../types/provider';

/**
 * Simplified LLM constants for subscription-only model.
 * Users don't choose specific LLM models - they use "Auto" through managed cloud subscription,
 * or local Ollama if running.
 */

// Provider labels - managed cloud and ollama are primary, others kept for type compatibility
export const PROVIDER_LABELS: Record<Provider, string> = {
  managed_cloud: 'Managed Cloud',
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot AI',
};

// Not needed for managed cloud - kept empty for compatibility
export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

// Simplified model presets - only managed cloud auto and ollama (dynamic)
export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  managed_cloud: [{ value: 'auto', label: 'Auto (Best Available)' }],
  ollama: [], // Populated dynamically from local Ollama installation
  // Legacy providers - empty for compatibility
  openai: [],
  anthropic: [],
  google: [],
  xai: [],
  deepseek: [],
  qwen: [],
  moonshot: [],
};

// Simplified provider order - only managed cloud and ollama
export const PROVIDERS_IN_ORDER: Provider[] = ['managed_cloud', 'ollama'];

// Minimal context windows - only for auto model
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  auto: 128_000, // Default context for managed cloud auto
};

export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 128_000;
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  thinking: boolean;
  computerUse: boolean;
  agentic: boolean;
  imageGen: boolean;
  videoGen: boolean;
  search: boolean;
  research: boolean;
}

export interface ModelMetadata {
  id: string;
  apiModelId?: string;
  name: string;
  provider: Provider;
  modelType: 'chat' | 'code' | 'reasoning' | 'multimodal' | 'image' | 'video' | 'search';
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  benchmarks?: {
    swebench?: number;
    humaneval?: number;
    mmlu?: number;
    gpqa?: number;
    aime?: number;
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  qualityTier: 'fast' | 'balanced' | 'best';
  bestFor: string[];
  released?: string;
}

// Minimal metadata - only managed cloud auto model
export const MODEL_METADATA: Record<string, ModelMetadata> = {
  auto: {
    id: 'auto',
    name: 'Auto (Best Available)',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0, // Included in subscription
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: true,
      agentic: true,
      imageGen: true,
      videoGen: true,
      search: true,
      research: true,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['All Tasks', 'Smart Routing', 'Best Value'],
    released: 'January 2026',
  },
};

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return MODEL_METADATA[modelId] ?? null;
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(MODEL_METADATA);
}

export function getProviderModels(provider: Provider): ModelMetadata[] {
  return getAllModels().filter((model) => model.provider === provider);
}

export function formatCost(inputCost?: number, outputCost?: number): string {
  if (inputCost === undefined && outputCost === undefined) {
    return 'N/A';
  }
  if (inputCost === 0 && outputCost === 0) {
    return 'Included';
  }
  const input = inputCost !== undefined ? `$${inputCost.toFixed(2)}` : 'N/A';
  const output = outputCost !== undefined ? `$${outputCost.toFixed(2)}` : 'N/A';
  return `${input}/${output} per 1M tokens`;
}
