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
  moonshot: 'Moonshot AI',
};

export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-5.1', label: 'GPT-5.1 ⭐ (Nov 24, 2025 - Latest)' },
    { value: 'gpt-5.1-instant', label: 'GPT-5.1 Instant (Quick Responses)' },
    { value: 'gpt-5.1-thinking', label: 'GPT-5.1 Thinking 🧠 (Complex Tasks)' },
    { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max (Agentic Coding, 24h+ Tasks)' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 ⭐ (Best Coding - 77.2% SWE-bench)' },
    {
      value: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5 ⚡ (Oct 15, 2025 - Fast & Cost Effective)',
    },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 🧠 (Deep Reasoning/Thinking)' },
  ],
  google: [
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro ⭐ (Nov 24, 2025 - Top Benchmarks)' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash (Fast)' },
    { value: 'gemini-3-deep-think', label: 'Gemini 3 Deep Think 🧠 (Advanced Reasoning/Thinking)' },
  ],
  ollama: [{ value: 'llama4-maverick', label: 'Llama 4 Maverick ⭐ (1M Context, Local)' }],
  xai: [
    { value: 'grok-4.1', label: 'Grok 4.1 ⭐ (Nov 24, 2025 - Enhanced Reasoning)' },
    { value: 'grok-4.1-fast', label: 'Grok 4.1 Fast ⚡ (Tool-calling, 2M Context)' },
  ],
  deepseek: [],
  qwen: [{ value: 'qwen3-max', label: 'Qwen3-Max ⭐ 🧠 (Nov 24, 2025 - Thinking Mode)' }],
  mistral: [],
  moonshot: [
    {
      value: 'kimi-k2-thinking',
      label: 'Kimi K2 Thinking ⭐ 🧠 (Nov 24, 2025 - Advanced Reasoning)',
    },
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
  'moonshot',
];

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.1': 128_000,
  'gpt-5.1-instant': 128_000,
  'gpt-5.1-thinking': 128_000,
  'gpt-5.1-codex-max': 256_000,

  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-opus-4-5': 200_000,

  'gemini-3-pro': 2_000_000,
  'gemini-3-flash': 2_000_000,
  'gemini-3-deep-think': 2_000_000,

  'llama4-maverick': 1_000_000,

  'grok-4.1': 128_000,
  'grok-4.1-fast': 2_000_000,

  'qwen3-max': 128_000,

  'kimi-k2-thinking': 256_000,
};

export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 4096;
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  capabilities: {
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    json: boolean;
  };
  benchmarks?: {
    swebench?: number;
    humaneval?: number;
    mmlu?: number;
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
  bestFor: string[];
  released?: string;
}

export const MODEL_METADATA: Record<string, ModelMetadata> = {
  'gpt-5.1': {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 5.5,
    outputCost: 16.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 68.0,
      humaneval: 94.0,
      mmlu: 90.5,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['General Intelligence', 'Reduced Hallucinations', 'Better Prompt Adherence'],
    released: 'November 24, 2025',
  },
  'gpt-5.1-instant': {
    id: 'gpt-5.1-instant',
    name: 'GPT-5.1 Instant',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 4.0,
    outputCost: 12.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 65.0,
      humaneval: 92.0,
      mmlu: 89.0,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Quick Responses', 'Real-time Applications'],
    released: 'November 24, 2025',
  },
  'gpt-5.1-thinking': {
    id: 'gpt-5.1-thinking',
    name: 'GPT-5.1 Thinking',
    provider: 'openai',
    contextWindow: 128_000,
    inputCost: 7.0,
    outputCost: 21.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 72.0,
      humaneval: 95.5,
      mmlu: 91.5,
    },
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['Complex Tasks', 'Deep Reasoning', 'Multi-step Problems'],
    released: 'November 24, 2025',
  },
  'gpt-5.1-codex-max': {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1-Codex-Max',
    provider: 'openai',
    contextWindow: 256_000,
    inputCost: 8.0,
    outputCost: 24.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 75.0,
      humaneval: 96.0,
      mmlu: 92.0,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Agentic Coding', 'Long-running Tasks (24h+)', 'Complex Software Engineering'],
    released: 'November 24, 2025',
  },

  'gemini-3-pro': {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
    inputCost: 1.5,
    outputCost: 6.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 62.0,
      humaneval: 91.5,
      mmlu: 89.5,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: ['Reasoning', 'Multimodal Understanding', 'Agentic Coding', 'Enterprise Applications'],
    released: 'November 24, 2025',
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'google',
    contextWindow: 2_000_000,
    inputCost: 0.1,
    outputCost: 0.4,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 55.0,
      humaneval: 88.5,
      mmlu: 87.0,
    },
    speed: 'very-fast',
    quality: 'excellent',
    bestFor: ['Speed', 'Cost Efficiency', 'Enterprise Applications'],
    released: 'November 24, 2025',
  },
  'gemini-3-deep-think': {
    id: 'gemini-3-deep-think',
    name: 'Gemini 3 Deep Think',
    provider: 'google',
    contextWindow: 2_000_000,
    inputCost: 3.0,
    outputCost: 12.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 68.0,
      humaneval: 93.0,
      mmlu: 90.5,
    },
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['Advanced Reasoning', 'Complex Enterprise Tasks'],
    released: 'November 24, 2025',
  },

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
      swebench: 77.2,
      humaneval: 93.7,
      mmlu: 88.7,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Coding', 'Software Engineering', 'Technical Writing'],
    released: 'November 24, 2025',
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
    released: 'October 15, 2025',
  },
  'claude-opus-4-5': {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
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
      swebench: 74.0,
      humaneval: 94.5,
      mmlu: 91.0,
    },
    speed: 'slow',
    quality: 'excellent',
    bestFor: ['Complex Reasoning', 'Research', 'Long Context', 'Deep Analysis'],
    released: 'November 24, 2025',
  },

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
    released: 'November 24, 2025',
  },

  'grok-4.1': {
    id: 'grok-4.1',
    name: 'Grok 4.1',
    provider: 'xai',
    contextWindow: 128_000,
    inputCost: 5.5,
    outputCost: 16.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 62.0,
      humaneval: 90.0,
      mmlu: 87.5,
    },
    speed: 'fast',
    quality: 'excellent',
    bestFor: [
      'Enhanced Reasoning',
      'Multimodal Understanding',
      'Emotional Intelligence',
      'Reduced Factual Errors',
    ],
    released: 'November 24, 2025',
  },
  'grok-4.1-fast': {
    id: 'grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    provider: 'xai',
    contextWindow: 2_000_000,
    inputCost: 4.0,
    outputCost: 12.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
    },
    benchmarks: {
      swebench: 58.0,
      humaneval: 88.5,
      mmlu: 86.0,
    },
    speed: 'very-fast',
    quality: 'excellent',
    bestFor: ['Tool-calling', 'Agentic Workflows', '2M Token Context', 'Agent Tools API'],
    released: 'November 24, 2025',
  },

  'qwen3-max': {
    id: 'qwen3-max',
    name: 'Qwen3-Max',
    provider: 'qwen',
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
      swebench: 70.0,
      humaneval: 92.5,
      mmlu: 89.0,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: ['Thinking Mode', 'Advanced Reasoning', 'Foundation Model Performance'],
    released: 'November 24, 2025',
  },

  'kimi-k2-thinking': {
    id: 'kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    provider: 'moonshot',
    contextWindow: 256_000,
    inputCost: 1.5,
    outputCost: 6.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
    },
    benchmarks: {
      swebench: 71.3,
      humaneval: 91.0,
      mmlu: 88.5,
    },
    speed: 'medium',
    quality: 'excellent',
    bestFor: [
      'Advanced Reasoning',
      'Agentic Tasks',
      'Thinking Mode',
      'Complex Problem Solving',
      '200-300 Sequential Tool Calls',
    ],
    released: 'November 24, 2025',
  },
};

export function getModelMetadata(modelId: string): ModelMetadata | null {
  return MODEL_METADATA[modelId] ?? null;
}

export function getProviderModels(provider: Provider): ModelMetadata[] {
  return Object.values(MODEL_METADATA).filter((model) => model.provider === provider);
}

export function getAllModels(): ModelMetadata[] {
  return Object.values(MODEL_METADATA);
}

export function formatCost(inputCost: number, outputCost: number): string {
  if (inputCost === 0 && outputCost === 0) {
    return 'Free (Local)';
  }
  return `$${inputCost.toFixed(2)}/$${outputCost.toFixed(2)} per 1M tokens`;
}

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const metadata = getModelMetadata(modelId);
  if (!metadata) return 0;

  const inputCost = (inputTokens / 1_000_000) * metadata.inputCost;
  const outputCost = (outputTokens / 1_000_000) * metadata.outputCost;

  return inputCost + outputCost;
}
