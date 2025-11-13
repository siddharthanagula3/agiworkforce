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
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  google: [
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  ollama: [
    { value: 'llama3.3', label: 'Llama 3.3 (local)' },
    { value: 'llama3', label: 'Llama 3 (local)' },
    { value: 'mistral', label: 'Mistral (local)' },
  ],
  xai: [
    { value: 'grok-4', label: 'Grok 4' },
    { value: 'grok-3', label: 'Grok 3' },
    { value: 'grok-2', label: 'Grok 2' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder' },
  ],
  qwen: [
    { value: 'qwen-max', label: 'Qwen Max' },
    { value: 'qwen-turbo', label: 'Qwen Turbo' },
    { value: 'qwen-plus', label: 'Qwen Plus' },
  ],
  mistral: [
    { value: 'mistral-large-latest', label: 'Mistral Large Latest' },
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
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI models
  'gpt-4o-mini': 128_000,
  'gpt-4.1-mini': 128_000,
  'gpt-4.1': 128_000,
  'gpt-4o': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_384,

  // Anthropic models
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,

  // Google models
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-1.0-pro': 32_768,

  // Ollama (local models) - varies by model
  'llama3.3': 8_192,
  llama3: 8_192,
  'llama3:70b': 8_192,
  mistral: 32_768,
  'mistral:7b': 32_768,
  codellama: 16_384,
  'deepseek-coder': 16_384,

  // xAI
  'grok-4': 128_000,
  'grok-3': 128_000,
  'grok-2': 128_000,

  // Qwen / Mistral cloud defaults
  'qwen-max': 32_768,
  'mistral-large-latest': 65_536,
};

/**
 * Get context window size for a model
 * Falls back to 4096 if model not found
 */
export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 4096;
}
