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
