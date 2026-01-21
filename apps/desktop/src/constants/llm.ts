import type { Provider } from '../types/provider';

/**
 * LLM Constants with Intelligent Model Routing (January 2026)
 *
 * This configuration powers the Auto mode routing system that selects
 * the optimal model based on:
 * - Task type (coding, reasoning, general, agentic, multimodal)
 * - Benchmark performance for that task type
 * - Cost efficiency (cheapest viable model)
 * - User's subscription tier
 *
 * ========================================
 * HOW TO ADD NEW MODELS (FOR DEVELOPERS)
 * ========================================
 *
 * When a new model is released:
 *
 * 1. Add to MODEL_METADATA with all required fields:
 *    - id: Unique identifier (e.g., 'gpt-6', 'claude-5-opus')
 *    - apiModelId: The actual API model ID from the provider
 *    - name: Human-readable name for UI display
 *    - provider: Must match a Provider type value
 *    - modelType: 'chat' | 'code' | 'reasoning' | 'multimodal' | 'image' | 'video' | 'search'
 *    - contextWindow: Max tokens the model can handle
 *    - inputCost/outputCost: Price per 1M tokens (check provider pricing page)
 *    - capabilities: What the model can do (tools, vision, etc.)
 *    - benchmarks: Scores from standard benchmarks (see sources below)
 *    - speed: 'very-fast' | 'fast' | 'medium' | 'slow'
 *    - quality: 'excellent' | 'good' | 'fair'
 *    - qualityTier: 'fast' | 'balanced' | 'best' (for UI grouping)
 *    - bestFor: Array of use cases for tooltips
 *
 * 2. Add to MODEL_CONTEXT_WINDOWS for context window lookup
 *
 * 3. Add to appropriate MODEL_POOL in modelRouter.ts:
 *    - auto-economy: Cheapest models (< $1/1M output)
 *    - auto-balanced: Mid-tier ($1-15/1M output)
 *    - auto-premium: Best quality (any price)
 *
 * 4. Update MODEL_PRESETS if the model should appear in QuickModelSelector
 *
 * BENCHMARK DATA SOURCES:
 * - LMArena.ai (chatbot-arena-leaderboard) - Overall quality ranking
 * - SWE-bench (swebench.com) - Coding ability
 * - GPQA Diamond - Graduate-level reasoning
 * - MMLU - General knowledge
 * - AIME 2024 - Math reasoning
 * - Provider benchmarks pages (fallback)
 *
 * PRICING SOURCES:
 * - OpenAI: https://openai.com/api/pricing
 * - Anthropic: https://anthropic.com/pricing
 * - Google: https://ai.google.dev/pricing
 * - xAI: https://x.ai/api
 * - DeepSeek: https://platform.deepseek.com/pricing
 *
 * LAST UPDATED: January 2026
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
  perplexity: 'Perplexity',
};

// Thinking model variants - models that support extended thinking/reasoning
// For subscription-only model, thinking variants are handled by managed cloud
// so this map is empty. Users don't manually select thinking variants.
export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

// Model presets for QuickModelSelector - organized by provider
export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  managed_cloud: [
    { value: 'auto-economy', label: 'Auto (Best Value)' },
    { value: 'auto-balanced', label: 'Auto Balanced' },
    { value: 'auto-premium', label: 'Auto (Best Model)' },
  ],
  ollama: [], // Populated dynamically from local Ollama installation
  openai: [
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4.5', label: 'Claude 4.5 Opus' },
    { value: 'claude-sonnet-4.5', label: 'Claude 4.5 Sonnet' },
  ],
  google: [
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
  ],
  xai: [
    { value: 'grok-4.1', label: 'Grok 4.1' },
    { value: 'grok-4-fast', label: 'Grok 4 Fast (2M ctx)' },
  ],
  deepseek: [{ value: 'deepseek-v3.2', label: 'DeepSeek V3.2' }],
  qwen: [{ value: 'qwen-3', label: 'Qwen 3' }],
  moonshot: [],
  perplexity: [],
};

// Provider order for UI display
export const PROVIDERS_IN_ORDER: Provider[] = [
  'managed_cloud',
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'ollama',
];

// Context windows for all models (verified January 2026)
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Default auto mode (subscription-only primary model)
  auto: 128_000, // Default context window for auto mode
  // Auto modes (inherit from best available)
  'auto-economy': 2_000_000, // Grok 4 Fast has 2M
  'auto-balanced': 200_000,
  'auto-premium': 400_000, // GPT-5.2 has 400K
  // OpenAI
  'gpt-5.2': 400_000, // Updated Jan 2026
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  // Anthropic
  'claude-opus-4.5': 200_000,
  'claude-sonnet-4.5': 200_000,
  // Google
  'gemini-3-pro': 2_000_000,
  'gemini-3-flash': 1_000_000,
  // xAI
  'grok-4.1': 256_000,
  'grok-4-fast': 2_000_000, // Largest context available!
  // DeepSeek
  'deepseek-v3.2': 128_000,
  // Qwen
  'qwen-3': 128_000,
};

export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId] ?? 128_000;
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean; // Function calling / tool use
  vision: boolean; // Can process images in input
  json: boolean; // Structured JSON output mode
  thinking: boolean; // Extended thinking / reasoning mode (like o1, Claude thinking)
  computerUse: boolean; // Can control mouse/keyboard (Anthropic computer use)
  agentic: boolean; // Optimized for multi-step autonomous tasks
  imageGen: boolean; // Can generate images
  videoGen: boolean; // Can generate videos
  search: boolean; // Has web search capability
  research: boolean; // Deep research / multi-source synthesis
  codeExecution: boolean; // Can execute code in sandbox (like OpenAI Code Interpreter)
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

/**
 * Comprehensive Model Metadata with January 2026 Benchmarks
 *
 * Pricing is per 1M tokens (input/output separately).
 * Benchmarks normalized to 0-100 scale where applicable.
 *
 * Task Type Routing Guide:
 * - coding: SWE-bench, HumanEval scores prioritized
 * - reasoning: GPQA Diamond, AIME scores prioritized
 * - general: MMLU, Arena ELO prioritized
 * - agentic: Tool use, computer use capabilities prioritized
 * - multimodal: Vision capabilities required
 */
export const MODEL_METADATA: Record<string, ModelMetadata> = {
  // ============================================
  // AUTO MODES (Smart Routing)
  // ============================================
  // Auto modes inherit capabilities from the models in their pool
  // The router selects based on task type and available model capabilities

  // Default 'auto' mode - the primary subscription-only model
  // This is what users see by default - intelligent task-based routing
  auto: {
    id: 'auto',
    name: 'Auto (Best Available)',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 128_000, // Conservative default, actual varies by routed model
    inputCost: 0, // Included in subscription
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true, // Managed cloud handles thinking when needed
      computerUse: true,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
      codeExecution: true,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['All Tasks', 'Automatic Optimization', 'Smart Routing'],
    released: 'January 2026',
  },

  'auto-economy': {
    id: 'auto-economy',
    name: 'Auto (Best Value)',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 2_000_000, // Grok 4 Fast has 2M context
    inputCost: 0, // Included in subscription
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true, // GPT-4o-mini, Gemini Flash have vision
      json: true,
      thinking: false, // Economy pool lacks thinking models
      computerUse: false, // No computer use in economy pool
      agentic: false, // Economy models not optimized for agentic
      imageGen: false,
      videoGen: false,
      search: true,
      research: false, // No deep research in economy
      codeExecution: true, // Gemini Flash has code execution
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Cost-Optimized', 'Simple Tasks', 'Quick Questions'],
    released: 'January 2026',
  },
  'auto-balanced': {
    id: 'auto-balanced',
    name: 'Auto Balanced',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 200_000,
    inputCost: 0,
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true, // Claude Sonnet, DeepSeek have thinking
      computerUse: true, // Claude Sonnet has computer use
      agentic: true,
      imageGen: false, // No image gen in balanced pool
      videoGen: false,
      search: true,
      research: true,
      codeExecution: true, // Gemini Pro has code execution
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Quality/Cost Balance', 'Most Tasks', 'Coding'],
    released: 'January 2026',
  },
  'auto-premium': {
    id: 'auto-premium',
    name: 'Auto (Best Model)',
    provider: 'managed_cloud',
    modelType: 'chat',
    contextWindow: 400_000, // GPT-5.2 has 400K context
    inputCost: 0,
    outputCost: 0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: true, // Claude Opus has best computer use
      agentic: true, // GPT-5.2 optimized for agentic
      imageGen: false, // Separate image gen models
      videoGen: false, // Separate video gen models
      search: true,
      research: true,
      codeExecution: true, // GPT-5.2, Gemini Pro have code exec
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Maximum Performance', 'Complex Tasks', 'Research'],
    released: 'January 2026',
  },

  // ============================================
  // OPENAI MODELS
  // Source: https://platform.openai.com/docs/models
  // Capabilities verified January 2026
  // ============================================
  'gpt-5.2': {
    id: 'gpt-5.2',
    apiModelId: 'gpt-5.2-2026-01',
    name: 'GPT-5.2',
    provider: 'openai',
    modelType: 'reasoning',
    contextWindow: 400_000, // 400K context (upgraded from 256K)
    inputCost: 1.75, // $1.75/1M input (verified Jan 2026)
    outputCost: 14.0, // $14/1M output (verified Jan 2026)
    capabilities: {
      streaming: true,
      tools: true, // Full function calling support
      vision: true, // Native vision in GPT-5 series
      json: true, // Structured outputs
      thinking: true, // Native reasoning mode (like o1)
      computerUse: true, // OpenAI computer use (sandbox)
      agentic: true, // Optimized for multi-step autonomous tasks
      imageGen: false, // Separate DALL-E model
      videoGen: false, // Separate Sora model
      search: true, // Web browsing capability
      research: true, // Deep research mode
      codeExecution: true, // Code Interpreter sandbox
    },
    benchmarks: {
      swebench: 65.2, // SWE-bench verified
      humaneval: 96.8,
      mmlu: 92.5,
      gpqa: 78.3,
      aime: 85.0,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Agentic Tasks', 'Complex Reasoning', 'Research'],
    released: 'January 2026',
  },
  'gpt-4o': {
    id: 'gpt-4o',
    apiModelId: 'gpt-4o-2024-11-20',
    name: 'GPT-4o',
    provider: 'openai',
    modelType: 'multimodal',
    contextWindow: 128_000,
    inputCost: 2.5, // $2.50/1M input
    outputCost: 10.0, // $10/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full function calling
      vision: true, // Native multimodal vision
      json: true, // Structured outputs
      thinking: false, // No extended thinking (use o1 for that)
      computerUse: false, // Not available in GPT-4o
      agentic: true, // Good for agentic with tools
      imageGen: false, // Separate DALL-E model
      videoGen: false,
      search: true, // Web browsing in ChatGPT
      research: true, // Deep research available
      codeExecution: true, // Code Interpreter available
    },
    benchmarks: {
      swebench: 38.4,
      humaneval: 90.2,
      mmlu: 88.7,
      gpqa: 53.6,
      aime: 45.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['General Tasks', 'Multimodal', 'Coding'],
    released: 'November 2024',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    apiModelId: 'gpt-4o-mini-2024-07-18',
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.15, // $0.15/1M input
    outputCost: 0.6, // $0.60/1M output
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: true, // Vision supported (same as GPT-4o)
      json: true, // Structured outputs
      thinking: false, // No reasoning mode
      computerUse: false, // Not available
      agentic: false, // Not optimized for long agentic tasks
      imageGen: false,
      videoGen: false,
      search: false, // No web browsing in mini
      research: false, // No deep research
      codeExecution: true, // Code Interpreter available
    },
    benchmarks: {
      swebench: 22.0,
      humaneval: 87.0,
      mmlu: 82.0,
      gpqa: 40.2,
      aime: 25.0,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Quick Tasks', 'Cost-Sensitive', 'Simple Queries'],
    released: 'July 2024',
  },

  // ============================================
  // ANTHROPIC MODELS
  // Source: https://docs.anthropic.com/en/docs/models-overview
  // Capabilities verified January 2026
  // ============================================
  'claude-opus-4.5': {
    id: 'claude-opus-4.5',
    apiModelId: 'claude-opus-4-5-20251101',
    name: 'Claude 4.5 Opus',
    provider: 'anthropic',
    modelType: 'reasoning',
    contextWindow: 200_000,
    inputCost: 5.0, // $5/1M input
    outputCost: 25.0, // $25/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full tool use with parallel execution
      vision: true, // Native multimodal vision
      json: true, // Structured outputs via tool_choice
      thinking: true, // Extended thinking mode available
      computerUse: true, // BEST computer use implementation
      agentic: true, // Excellent for multi-step autonomous tasks
      imageGen: false, // No image generation
      videoGen: false, // No video generation
      search: false, // No native web search (use tools)
      research: false, // No built-in research (use tools)
      codeExecution: false, // No sandbox execution (use MCP tools)
    },
    benchmarks: {
      swebench: 80.9, // BEST for coding (Jan 2026)
      humaneval: 97.2,
      mmlu: 91.8,
      gpqa: 82.5,
      aime: 78.0,
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Coding', 'Complex Analysis', 'Computer Use', 'Long Documents'],
    released: 'November 2025',
  },
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    apiModelId: 'claude-sonnet-4-5-20251022',
    name: 'Claude 4.5 Sonnet',
    provider: 'anthropic',
    modelType: 'code',
    contextWindow: 200_000,
    inputCost: 3.0, // $3/1M input
    outputCost: 15.0, // $15/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full tool use support
      vision: true, // Native vision
      json: true, // Structured outputs
      thinking: true, // Extended thinking available
      computerUse: true, // Computer use supported
      agentic: true, // Great for agentic workflows
      imageGen: false,
      videoGen: false,
      search: false, // No native web search
      research: false, // No built-in research
      codeExecution: false, // No sandbox (use external tools)
    },
    benchmarks: {
      swebench: 77.2, // Second best for coding
      humaneval: 95.8,
      mmlu: 89.5,
      gpqa: 75.2,
      aime: 68.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Tool Use', 'Computer Use'],
    released: 'October 2025',
  },

  // ============================================
  // GOOGLE MODELS
  // Source: https://ai.google.dev/gemini-api/docs/models
  // Capabilities verified January 2026
  // ============================================
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    apiModelId: 'gemini-3.0-pro',
    name: 'Gemini 3 Pro',
    provider: 'google',
    modelType: 'reasoning',
    contextWindow: 2_000_000, // 2M context window
    inputCost: 1.25, // $1.25/1M input
    outputCost: 5.0, // $5/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full function calling
      vision: true, // Native multimodal (images, video, audio)
      json: true, // JSON mode supported
      thinking: true, // Deep Think / reasoning mode
      computerUse: false, // Not available
      agentic: true, // Good for multi-step tasks
      imageGen: false, // Separate Imagen model
      videoGen: false, // Separate Veo model
      search: true, // Google Search grounding
      research: true, // Deep research via grounding
      codeExecution: true, // Native code execution sandbox
    },
    benchmarks: {
      swebench: 52.8,
      humaneval: 93.5,
      mmlu: 90.2, // Arena ELO: 1501 (top)
      gpqa: 76.8,
      aime: 72.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Long Context', 'Research', 'Multimodal', 'Code Execution'],
    released: 'December 2025',
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
    apiModelId: 'gemini-3.0-flash',
    name: 'Gemini 3 Flash',
    provider: 'google',
    modelType: 'chat',
    contextWindow: 1_000_000, // 1M context
    inputCost: 0.08, // $0.075/1M input - CHEAPEST
    outputCost: 0.3, // $0.30/1M output
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: true, // Multimodal vision
      json: true, // JSON mode
      thinking: false, // Flash Thinking exists but limited
      computerUse: false, // Not available
      agentic: false, // Not optimized for long agentic
      imageGen: false,
      videoGen: false,
      search: true, // Search grounding available
      research: false, // No deep research
      codeExecution: true, // Code execution sandbox
    },
    benchmarks: {
      swebench: 35.2,
      humaneval: 88.5,
      mmlu: 85.8,
      gpqa: 58.2,
      aime: 42.0,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Speed', 'Cost-Sensitive', 'Long Context'],
    released: 'December 2025',
  },

  // ============================================
  // XAI MODELS
  // Source: https://docs.x.ai/docs
  // Capabilities verified January 2026
  // NOTE: Vision requires separate grok-2-vision model
  // ============================================
  'grok-4.1': {
    id: 'grok-4.1',
    apiModelId: 'grok-4.1',
    name: 'Grok 4.1',
    provider: 'xai',
    modelType: 'reasoning',
    contextWindow: 256_000,
    inputCost: 3.0, // $3/1M input
    outputCost: 15.0, // $15/1M output
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: false, // NO VISION - requires separate grok-2-vision model
      json: true, // JSON mode available
      thinking: true, // Think mode for complex reasoning
      computerUse: false, // Not available
      agentic: true, // Good for autonomous tasks
      imageGen: false, // Separate Aurora model
      videoGen: false,
      search: true, // Real-time X/Twitter data access
      research: true, // DeepSearch mode
      codeExecution: true, // Live code sandbox
    },
    benchmarks: {
      swebench: 55.3,
      humaneval: 94.2,
      mmlu: 89.8, // Arena ELO: 1483
      gpqa: 74.5,
      aime: 70.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Real-time Info', 'Reasoning', 'X/Twitter Data'],
    released: 'January 2026',
  },

  // Grok 4 Fast - Economy model with massive context
  'grok-4-fast': {
    id: 'grok-4-fast',
    apiModelId: 'grok-4-fast',
    name: 'Grok 4 Fast',
    provider: 'xai',
    modelType: 'chat',
    contextWindow: 2_000_000, // 2M context - largest available
    inputCost: 0.2, // $0.20/1M input (verified Jan 2026)
    outputCost: 0.5, // $0.50/1M output (verified Jan 2026)
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: false, // NO VISION - requires separate grok-2-vision
      json: true, // JSON mode available
      thinking: false, // Fast mode, no extended thinking
      computerUse: false, // Not available
      agentic: false, // Optimized for speed not complex agentic
      imageGen: false,
      videoGen: false,
      search: true, // Real-time X/Twitter data access
      research: false, // No deep research in fast mode
      codeExecution: true, // Code execution available
    },
    benchmarks: {
      swebench: 42.0,
      humaneval: 88.5,
      mmlu: 84.2,
      gpqa: 58.0,
      aime: 45.0,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Long Context', 'Real-time Data', 'Cost-Effective', 'Speed'],
    released: 'January 2026',
  },

  // ============================================
  // DEEPSEEK MODELS
  // Source: https://platform.deepseek.com/docs
  // Capabilities verified January 2026
  // NOTE: Vision requires separate deepseek-vl model
  // ============================================
  'deepseek-v3.2': {
    id: 'deepseek-v3.2',
    apiModelId: 'deepseek-chat-v3.2',
    name: 'DeepSeek V3.2',
    provider: 'deepseek',
    modelType: 'code',
    contextWindow: 128_000,
    inputCost: 0.27, // $0.27/1M input - Very cheap
    outputCost: 1.1, // $1.10/1M output
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: false, // NO VISION - requires separate deepseek-vl model
      json: true, // JSON mode available
      thinking: true, // DeepThink mode (like R1)
      computerUse: false, // Not available
      agentic: true, // Good for multi-step coding tasks
      imageGen: false,
      videoGen: false,
      search: false, // No web search
      research: false, // No built-in research
      codeExecution: false, // No sandbox (must use external tools)
    },
    benchmarks: {
      swebench: 58.5, // Very competitive for price
      humaneval: 92.8,
      mmlu: 87.5,
      gpqa: 68.3,
      aime: 60.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Cost-Effective', 'Technical Tasks', 'Reasoning'],
    released: 'January 2026',
  },

  // ============================================
  // QWEN MODELS
  // Source: https://help.aliyun.com/zh/model-studio/developer-reference/qwen
  // Capabilities verified January 2026
  // NOTE: Vision requires separate qwen-vl model
  // ============================================
  'qwen-3': {
    id: 'qwen-3',
    apiModelId: 'qwen-max-2025-01',
    name: 'Qwen 3',
    provider: 'qwen',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.4, // $0.40/1M input
    outputCost: 1.2, // $1.20/1M output
    capabilities: {
      streaming: true,
      tools: true, // MCP + function calling supported
      vision: false, // NO VISION - requires separate qwen-vl model
      json: true, // JSON mode available
      thinking: true, // Dual-mode thinking (enable_thinking param)
      computerUse: false, // Not available
      agentic: false, // Basic agentic via tools
      imageGen: false,
      videoGen: false,
      search: false, // No built-in web search
      research: false, // No built-in research
      codeExecution: false, // Via Qwen-Agent only
    },
    benchmarks: {
      swebench: 45.2,
      humaneval: 89.5,
      mmlu: 86.2,
      gpqa: 62.5,
      aime: 48.0,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['Multilingual', 'Chinese', 'General Tasks', 'Reasoning'],
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
