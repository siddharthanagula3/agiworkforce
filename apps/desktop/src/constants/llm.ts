import type { Provider } from '../types/provider';

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot AI',
  managed_cloud: 'Managed Cloud',
};

export const THINKING_MODEL_VARIANTS: Record<string, string> = {
  'gpt-5.2': 'gpt-5.2-pro',
  'gpt-5.1': 'gpt-5.1-thinking',
  'gpt-5.1-chat-latest': 'gpt-5.1-thinking',
  'claude-sonnet-4-5': 'claude-opus-4-5',
  'gemini-3-pro': 'gemini-3-deep-think',
  'gemini-3-flash': 'gemini-3-deep-think',
  'qwen3-turbo': 'qwen3-max', // Fallback for qwen
  'kimi-k2': 'kimi-k2-thinking',
};

export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-5-nano', label: 'GPT-5 Nano ⚡ (Ultra Fast & Cheap)' },
    { value: 'gpt-5.2', label: 'GPT-5.2 ⭐ (Flagship - 187 tok/s)' },
    { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro 🧠 (Best All-Around)' },
    { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex (Best Code Gen)' },
    { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat (Efficient)' },
    { value: 'gpt-5.1', label: 'GPT-5.1 (Legacy Flagship)' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 ⚡ (Fast & Affordable)' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 ⭐ (Excellent Coding)' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 🧠 (Best Coding & Reasoning)' },
  ],
  google: [
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash ⚡ (Best Value Chat)' },
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro ⭐ (Best Chat Quality 1501 Elo)' },
    { value: 'gemini-3-deep-think', label: 'Gemini 3 Deep Think 🧠 (Advanced Reasoning)' },
  ],
  ollama: [{ value: 'llama4-maverick', label: 'Llama 4 Maverick ⭐ (1M Context, Local)' }],
  xai: [
    { value: 'grok-4.1-fast', label: 'Grok 4.1 Fast ⚡ (2M Context, Tool-use)' },
    { value: 'grok-4.1', label: 'Grok 4.1 ⭐ (Emotionally Intelligent)' },
    { value: 'grok-3-mini', label: 'Grok 3 Mini (Budget)' },
  ],
  deepseek: [
    { value: 'deepseek-v3.2', label: 'DeepSeek V3.2 ⚡ (Best Cost Efficiency $0.28)' },
    { value: 'deepseek-chat', label: 'DeepSeek V3 (Legacy)' },
  ],
  qwen: [
    { value: 'qwen3-coder-32b', label: 'Qwen3-Coder 32B ⭐ (Best Open-Source Coding)' },
    { value: 'qwen3-max', label: 'Qwen3-Max 🧠 (Deep Reasoning)' },
  ],
  moonshot: [{ value: 'kimi-k2-thinking', label: 'Kimi K2 Thinking 🧠 (Best Math 99.1% AIME)' }],
  managed_cloud: [{ value: 'managed-cloud-auto', label: 'Auto (Smart Routing) ⭐' }],
};

export const PROVIDERS_IN_ORDER: Provider[] = [
  'openai',
  'anthropic',
  'google',
  'deepseek', // Moved up due to high value
  'ollama',
  'xai',
  'qwen',
  'moonshot',
  'managed_cloud',
];

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-5.2': 400_000,
  'gpt-5.2-pro': 400_000,
  'gpt-5.2-codex': 400_000,
  'gpt-5.2-chat-latest': 400_000,
  'gpt-5-nano': 128_000,
  'gpt-5.1': 128_000,
  'gpt-5.1-thinking': 128_000,

  // Anthropic
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,

  // Google
  'gemini-3-pro': 1_000_000,
  'gemini-3-flash': 1_000_000,
  'gemini-3-deep-think': 1_000_000,

  // DeepSeek
  'deepseek-v3.2': 128_000,
  'deepseek-chat': 128_000,

  // xAI
  'grok-4.1': 128_000,
  'grok-4.1-fast': 2_000_000,
  'grok-3-mini': 128_000,

  // Qwen
  'qwen3-coder-32b': 128_000,
  'qwen3-max': 128_000,

  // Moonshot
  'kimi-k2-thinking': 200_000,

  // Ollama
  'llama4-maverick': 1_000_000,

  // Auto
  'managed-cloud-auto': 128_000,
};

export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 4096;
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  thinking: boolean;
  computerUse: boolean; // Can control mouse/keyboard
  agentic: boolean; // Can run multi-step workflows
  imageGen: boolean; // Can generate images
  videoGen: boolean; // Can generate videos
  search: boolean; // Can search the web
  research: boolean; // Deep research capabilities
}

export interface ModelMetadata {
  id: string;
  apiModelId?: string; // Real API model ID for backend calls
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

export const MODEL_METADATA: Record<string, ModelMetadata> = {
  // ============================================
  // MANAGED CLOUD (AUTO)
  // ============================================
  'managed-cloud-auto': {
    id: 'managed-cloud-auto',
    name: 'Auto (Best Value)',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0,
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
    bestFor: ['All Tasks (Managed)'],
    released: 'December 2025',
  },

  // ============================================
  // OPENAI
  // ============================================
  'gpt-5.2': {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 400_000,
    inputCost: 2.5,
    outputCost: 10.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false, // Core model doesn't force thinking
      computerUse: false,
      agentic: true,
      imageGen: true,
      videoGen: false,
      search: true,
      research: false,
    },
    benchmarks: {
      swebench: 76.3,
      humaneval: 95.0,
      mmlu: 92.0,
      gpqa: 88.1,
      aime: 100.0,
    },
    speed: 'very-fast', // 187 tok/s
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Fastest Premium', 'Math', 'General Purpose'],
    released: 'December 2025',
  },
  'gpt-5.2-pro': {
    id: 'gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    provider: 'openai',
    modelType: 'reasoning',
    contextWindow: 400_000,
    inputCost: 5.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true, // Typically enhanced reasoning
      computerUse: false,
      agentic: true,
      imageGen: true,
      videoGen: false,
      search: true,
      research: true,
    },
    benchmarks: {
      swebench: 76.0,
      humaneval: 96.0,
      mmlu: 93.0,
      gpqa: 89.0,
      aime: 100.0,
    },
    speed: 'fast', // ~150 tok/s
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Best All-Around', 'Complex Reasoning'],
    released: 'December 2025',
  },
  'gpt-5.2-codex': {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2 Codex',
    provider: 'openai',
    modelType: 'code',
    contextWindow: 400_000,
    inputCost: 8.0,
    outputCost: 24.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: true, // Can write computer use scripts well
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
    },
    benchmarks: {
      swebench: 76.0, // Deduced from Pass@1 89%
      humaneval: 97.0,
      mmlu: 91.0,
    },
    speed: 'fast', // ~140 tok/s
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Code Generation', 'Software Engineering'],
    released: 'December 2025',
  },
  'gpt-5-nano': {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.05,
    outputCost: 0.4,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    speed: 'very-fast', // ~200 tok/s
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['High Volume', 'Simple Tasks', 'Cost Efficiency'],
    released: 'December 2025',
  },
  'gpt-5.2-chat-latest': {
    id: 'gpt-5.2-chat-latest',
    name: 'GPT-5.2 Chat',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 400_000,
    inputCost: 4.0,
    outputCost: 12.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Efficient Chat', 'General Assistant'],
    released: 'December 2025',
  },
  'gpt-5.1': {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 5.5,
    outputCost: 16.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
    },
    benchmarks: { swebench: 73.0 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Legacy tasks'],
    released: 'November 2025',
  },

  // ============================================
  // ANTHROPIC
  // ============================================
  'claude-opus-4-5': {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    modelType: 'reasoning',
    contextWindow: 200_000,
    inputCost: 5.0,
    outputCost: 25.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: true,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
    },
    benchmarks: {
      swebench: 80.9,
      humaneval: 95.0,
      mmlu: 92.0,
      gpqa: 87.0,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Coding (Top Tier)', 'Complex Reasoning', 'Real-world Jobs'],
    released: 'December 2025',
  },
  'claude-sonnet-4-5': {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    modelType: 'code',
    contextWindow: 200_000,
    inputCost: 3.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: true,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
    },
    benchmarks: {
      swebench: 77.2,
      humaneval: 94.0,
      mmlu: 91.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Balanced Reasoning'],
    released: 'November 2025',
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    modelType: 'chat',
    contextWindow: 200_000,
    inputCost: 1.0,
    outputCost: 5.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    benchmarks: { swebench: 65.0 },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Budget Coding', 'Fast Chat'],
    released: 'October 2025',
  },

  // ============================================
  // GOOGLE
  // ============================================
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'google',
    modelType: 'multimodal',
    contextWindow: 1_000_000,
    inputCost: 1.5,
    outputCost: 6.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: true,
      videoGen: true,
      search: true,
      research: true,
    },
    benchmarks: {
      swebench: 76.2,
      humaneval: 93.0,
      mmlu: 91.0,
      gpqa: 91.9,
      aime: 100.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Chat Quality (1501 Elo)', 'Reasoning', 'Multimodal'],
    released: 'December 2025',
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'google',
    modelType: 'multimodal',
    contextWindow: 1_000_000,
    inputCost: 0.075,
    outputCost: 0.3,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false, // Usually stripped in flash
      videoGen: false,
      search: true,
      research: false,
    },
    benchmarks: { swebench: 65.0 },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['High Context', 'Best Value Chat', 'Summarization'],
    released: 'November 2025',
  },
  'gemini-3-deep-think': {
    id: 'gemini-3-deep-think',
    name: 'Gemini 3 Deep Think',
    provider: 'google',
    modelType: 'reasoning',
    contextWindow: 1_000_000,
    inputCost: 2.0,
    outputCost: 8.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
    },
    benchmarks: { gpqa: 90.0, aime: 98.0 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Advanced Reasoning', 'Complex Math'],
    released: 'November 2025',
  },

  // ============================================
  // DEEPSEEK
  // ============================================
  'deepseek-v3.2': {
    id: 'deepseek-v3.2',
    apiModelId: 'deepseek-chat', // Maps to chat endpoint usually
    name: 'DeepSeek V3.2',
    provider: 'deepseek',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.28,
    outputCost: 0.28,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false, // Standard chat
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    benchmarks: { swebench: 73.1, aime: 87.5 },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced', // Surprisingly good for cost
    bestFor: ['Best Cost Efficiency', 'Coding on Budget', 'Math'],
    released: 'December 2025',
  },
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.14,
    outputCost: 0.28,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Lowest Cost'],
    released: 'December 2025',
  },

  // ============================================
  // XAI (GROK)
  // ============================================
  'grok-4.1': {
    id: 'grok-4.1',
    name: 'Grok 4.1',
    provider: 'xai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 5.5,
    outputCost: 16.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false, // Text focused usually
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true, // Strong search
      research: true,
    },
    benchmarks: { gpqa: 87.5, swebench: 75.0 },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Real-time Search', 'Chat Personality', 'Reasoning'],
    released: 'December 2025',
  },
  'grok-4.1-fast': {
    id: 'grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    provider: 'xai',
    modelType: 'chat',
    contextWindow: 2_000_000,
    inputCost: 0.1,
    outputCost: 0.4, // Assuming aggressive pricing for "Fast"
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Large Context', 'Fast Tool Use'],
    released: 'December 2025',
  },
  'grok-3-mini': {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.3,
    outputCost: 0.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['General Chat'],
    released: 'Late 2025',
  },

  // ============================================
  // QWEN
  // ============================================
  'qwen3-coder-32b': {
    id: 'qwen3-coder-32b',
    apiModelId: 'qwen3-coder-32b',
    name: 'Qwen3-Coder 32B',
    provider: 'qwen',
    modelType: 'code',
    contextWindow: 128_000,
    inputCost: 2.5,
    outputCost: 10.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    benchmarks: { swebench: 69.6, humaneval: 92.1 },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Open Source Coding', 'Python'],
    released: 'December 2025',
  },
  'qwen3-max': {
    id: 'qwen3-max',
    name: 'Qwen3-Max',
    provider: 'qwen',
    modelType: 'reasoning',
    contextWindow: 128_000,
    inputCost: 2.5,
    outputCost: 10.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true, // Often multimodal
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true, // Often integrated
      research: true,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Reasoning', 'Chinese Language'],
    released: 'December 2025',
  },

  // ============================================
  // MOONSHOT
  // ============================================
  'kimi-k2-thinking': {
    id: 'kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    provider: 'moonshot',
    modelType: 'reasoning',
    contextWindow: 200_000,
    inputCost: 1.5,
    outputCost: 6.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true, // High autonomous tool use
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
    },
    benchmarks: { aime: 99.1, gpqa: 84.5 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Math (99.1% AIME)', 'Agentic Workflows'],
    released: 'December 2025',
  },

  // ============================================
  // OLLAMA
  // ============================================
  'llama4-maverick': {
    id: 'llama4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'ollama',
    modelType: 'chat',
    contextWindow: 1_000_000,
    inputCost: 0,
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Local Privacy', 'Unlimited Use'],
    released: 'December 2025',
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
    return 'Free';
  }
  const input = inputCost !== undefined ? `$${inputCost.toFixed(2)}` : 'N/A';
  const output = outputCost !== undefined ? `$${outputCost.toFixed(2)}` : 'N/A';
  return `${input}/${output} per 1M tokens`;
}
