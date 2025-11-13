import type { Provider } from '../stores/settingsStore';

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  mistral: 'Mistral',
};

export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  openai: [
    // November 2025 models
    { value: 'gpt-5', label: 'GPT-5 ⭐ (Most Capable)' },
    { value: 'gpt-4o', label: 'GPT-4o (Fast)' },
    { value: 'o3', label: 'O3 (Deep Reasoning)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Legacy)' },
  ],
  anthropic: [
    // November 2025 models
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 ⭐ (Best Coding)' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 ⚡ (4x Faster, Auto Mode)' },
    { value: 'claude-opus-4', label: 'Claude Opus 4 (Deep Reasoning)' },
    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4 (Fast)' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Legacy)' },
  ],
  google: [
    // November 2025 models
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro ⭐ (1M Context)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Legacy)' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Legacy)' },
  ],
  ollama: [
    // November 2025 local models
    { value: 'llama4-maverick', label: 'Llama 4 Maverick ⭐ (1M Context)' },
    { value: 'deepseek-coder-v3', label: 'DeepSeek Coder V3 (Coding)' },
    { value: 'llama3.3', label: 'Llama 3.3 (Legacy)' },
    { value: 'llama3', label: 'Llama 3 (Legacy)' },
    { value: 'mistral', label: 'Mistral (Legacy)' },
  ],
  xai: [
    { value: 'grok-4', label: 'Grok 4 ⭐ (Real-time Data)' },
    { value: 'grok-3', label: 'Grok 3' },
    { value: 'grok-2', label: 'Grok 2' },
  ],
  deepseek: [
    { value: 'deepseek-v3', label: 'DeepSeek V3 ⭐ (Coding)' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder (Legacy)' },
  ],
  qwen: [
    { value: 'qwen-max', label: 'Qwen Max' },
    { value: 'qwen-turbo', label: 'Qwen Turbo' },
    { value: 'qwen-plus', label: 'Qwen Plus' },
  ],
  mistral: [
    { value: 'mistral-large-2', label: 'Mistral Large 2 ⭐' },
    { value: 'mistral-large-latest', label: 'Mistral Large (Auto)' },
    { value: 'mistral-small', label: 'Mistral Small' },
    { value: 'mistral-medium', label: 'Mistral Medium' },
  ],
};

export const PROVIDERS_IN_ORDER: Provider[] = [
  'openai',
  'anthropic',
  'google',
  'ollama',
  'xai',
  'deepseek',
  'qwen',
  'mistral',
];

/**
 * Model-specific context window sizes (in tokens)
 * These are the maximum context windows for each model
 * Updated for November 2025 models
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI models (November 2025)
  'gpt-5': 128_000, // Released Aug 2025
  'gpt-4o': 128_000,
  o3: 128_000, // Reasoning model
  'gpt-4o-mini': 128_000,
  'gpt-4.1-mini': 128_000,
  'gpt-4.1': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_384,

  // Anthropic models (November 2025)
  'claude-sonnet-4-5': 200_000, // Released Sep 2025 - best coding (77.2% SWE-bench)
  'claude-haiku-4-5': 200_000, // 4-5x faster than Sonnet, 1/3 cost - ideal for auto mode
  'claude-opus-4': 200_000, // May 2025 - deep reasoning
  'claude-sonnet-4': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,

  // Google models (November 2025)
  'gemini-2.5-pro': 1_000_000, // 1M token context
  'gemini-2.5-flash': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-1.0-pro': 32_768,

  // Ollama (local models) - November 2025
  'llama4-maverick': 1_000_000, // 1M context, local inference
  'deepseek-coder-v3': 64_000, // Coding specialist
  'llama3.3': 8_192,
  llama3: 8_192,
  'llama3:70b': 8_192,
  mistral: 32_768,
  'mistral:7b': 32_768,
  codellama: 16_384,
  'deepseek-coder': 16_384,

  // xAI (November 2025)
  'grok-4': 128_000, // Real-time data access
  'grok-3': 128_000,
  'grok-2': 128_000,

  // DeepSeek (November 2025)
  'deepseek-v3': 64_000, // Coding specialist
  'deepseek-chat': 32_768,

  // Qwen / Mistral cloud
  'qwen-max': 32_768,
  'qwen-turbo': 32_768,
  'qwen-plus': 32_768,
  'mistral-large-2': 128_000, // Updated model
  'mistral-large-latest': 65_536,
  'mistral-small': 32_768,
  'mistral-medium': 65_536,
};

/**
 * Get context window size for a model
 * Falls back to 4096 if model not found
 */
export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 4096;
}

/**
 * Comprehensive model metadata including costs, capabilities, and benchmarks
 */
export interface ModelMetadata {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  inputCost: number; // USD per 1M tokens
  outputCost: number; // USD per 1M tokens
  capabilities: {
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    json: boolean;
  };
  benchmarks?: {
    swebench?: number; // % score on SWE-bench
    humaneval?: number; // % score on HumanEval
    mmlu?: number; // % score on MMLU
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  bestFor: string[];
  released?: string; // Release date
}

/**
 * Complete model metadata catalog
 * Updated for November 2025 models
 */
export const MODEL_METADATA: Record<string, ModelMetadata> = {
  // OpenAI Models
  'gpt-5': {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 5.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 65.0,
      humaneval: 92.5,
      mmlu: 89.8,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['General Intelligence', 'Complex Reasoning', 'Multimodal Tasks'],
    released: 'August 2025',
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 2.5,
    outputCost: 10.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 60.0,
      humaneval: 90.2,
      mmlu: 88.7,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Fast Inference', 'Vision', 'Multimodal'],
    released: 'May 2024',
  },
  o3: {
    id: 'o3',
    name: 'O3',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 10.0,
    outputCost: 30.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 71.7,
      humaneval: 96.7,
      mmlu: 92.3,
    },
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['Deep Reasoning', 'Complex Problems', 'Mathematics'],
    released: 'December 2024',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 0.15,
    outputCost: 0.6,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 48.0,
      humaneval: 87.2,
      mmlu: 82.0,
    },
    speed: 'very-fast',
    quality: 'good',
    bestFor: ['Speed', 'Cost Efficiency', 'Simple Tasks'],
    released: 'July 2024',
  },

  // Anthropic Models
  'claude-sonnet-4-5': {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    inputCost: 3.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 77.2, // Best coding model
      humaneval: 93.7,
      mmlu: 88.7,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Coding', 'Software Engineering', 'Technical Writing'],
    released: 'September 2025',
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    inputCost: 1.0,
    outputCost: 5.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 65.0,
      humaneval: 88.9,
      mmlu: 85.9,
    },
    speed: 'very-fast',
    quality: 'excellent',
    bestFor: ['Auto Mode', 'Fast Responses', 'Cost Efficiency'],
    released: 'October 2024',
  },
  'claude-opus-4': {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    inputCost: 15.0,
    outputCost: 75.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 73.5,
      humaneval: 94.2,
      mmlu: 90.7,
    },
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['Complex Reasoning', 'Research', 'Long Context'],
    released: 'May 2025',
  },
  'claude-3-5-sonnet-20241022': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    inputCost: 3.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 49.0,
      humaneval: 92.0,
      mmlu: 88.3,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Coding', 'Analysis', 'General Tasks'],
    released: 'October 2024',
  },

  // Google Models
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextWindow: 1_000_000,
    inputCost: 1.25,
    outputCost: 5.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 55.0,
      humaneval: 89.5,
      mmlu: 87.9,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Long Context', 'Multimodal', 'Large Documents'],
    released: 'February 2025',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    inputCost: 0.075,
    outputCost: 0.3,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 48.0,
      humaneval: 85.7,
      mmlu: 84.0,
    },
    speed: 'very-fast',
    quality: 'good',
    bestFor: ['Speed', 'Cost', 'Long Context'],
    released: 'February 2025',
  },

  // Ollama Local Models
  'llama4-maverick': {
    id: 'llama4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'ollama',
    contextWindow: 1_000_000,
    inputCost: 0,
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 52.0,
      humaneval: 87.0,
      mmlu: 86.0,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Local Inference', 'Privacy', 'Zero Cost'],
    released: 'November 2025',
  },
  'deepseek-coder-v3': {
    id: 'deepseek-coder-v3',
    name: 'DeepSeek Coder V3',
    provider: 'ollama',
    contextWindow: 64_000,
    inputCost: 0,
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 68.0,
      humaneval: 91.2,
      mmlu: 79.0,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Coding', 'Local Development', 'Privacy'],
    released: 'December 2024',
  },

  // xAI Models
  'grok-4': {
    id: 'grok-4',
    name: 'Grok 4',
    provider: 'xai',
    contextWindow: 128_000,
    inputCost: 5.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 58.0,
      humaneval: 88.5,
      mmlu: 86.5,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Real-time Data', 'Current Events', 'Humor'],
    released: 'October 2025',
  },

  // DeepSeek Cloud Models
  'deepseek-v3': {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    contextWindow: 64_000,
    inputCost: 0.27,
    outputCost: 1.1,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 68.0,
      humaneval: 91.2,
      mmlu: 79.0,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Coding', 'Mathematics', 'Cost Efficiency'],
    released: 'December 2024',
  },

  // Mistral Models
  'mistral-large-2': {
    id: 'mistral-large-2',
    name: 'Mistral Large 2',
    provider: 'mistral',
    contextWindow: 128_000,
    inputCost: 2.0,
    outputCost: 6.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 52.0,
      humaneval: 86.0,
      mmlu: 84.0,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['European Data Residency', 'Multilingual', 'Code'],
    released: 'July 2024',
  },
};

/**
 * Get model metadata by ID
 */
export function getModelMetadata(modelId: string): ModelMetadata | null {
  return MODEL_METADATA[modelId] ?? null;
}

/**
 * Get all models for a provider
 */
export function getProviderModels(provider: Provider): ModelMetadata[] {
  return Object.values(MODEL_METADATA).filter((model) => model.provider === provider);
}

/**
 * Get all available models
 */
export function getAllModels(): ModelMetadata[] {
  return Object.values(MODEL_METADATA);
}

/**
 * Format cost for display (USD per 1M tokens)
 */
export function formatCost(inputCost: number, outputCost: number): string {
  if (inputCost === 0 && outputCost === 0) {
    return 'Free (Local)';
  }
  return `$${inputCost.toFixed(2)}/$${outputCost.toFixed(2)} per 1M tokens`;
}

/**
 * Calculate estimated cost for a conversation
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;

  const inputCost = (inputTokens / 1_000_000) * metadata.inputCost;
  const outputCost = (outputTokens / 1_000_000) * metadata.outputCost;

  return inputCost + outputCost;
}
