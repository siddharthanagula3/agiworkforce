import type { Provider } from '../types/provider';
import type { SubscriptionTier } from './planModels';

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
  zhipu: 'ZhipuAI',
  'black-forest-labs': 'Black Forest Labs',
  suno: 'Suno',
  udio: 'Udio',
};

// Thinking model variants - models that support extended thinking/reasoning
// For subscription-only model, thinking variants are handled by managed cloud
// so this map is empty. Users don't manually select thinking variants.
export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

// Model presets for QuickModelSelector - organized by provider
export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  managed_cloud: [
    { value: 'auto-economy', label: 'Auto (Economy)' },
    { value: 'auto-balanced', label: 'Auto Balanced' },
    { value: 'auto-premium', label: 'Auto (Best Model)' },
  ],
  ollama: [], // Populated dynamically from local Ollama installation
  openai: [
    { value: 'gpt-5-pro', label: 'GPT-5 Pro' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.2-codex-low', label: 'GPT-5.2 Codex (Low)' },
    { value: 'gpt-5.2-codex-medium', label: 'GPT-5.2 Codex (Medium)' },
    { value: 'gpt-5.2-codex-high', label: 'GPT-5.2 Codex (High)' },
    { value: 'gpt-5.2-codex-xhigh', label: 'GPT-5.2 Codex (XHigh)' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  ],
  anthropic: [
    { value: 'claude-opus-4.6', label: 'Claude 4.6 Opus' },
    { value: 'claude-sonnet-4.6', label: 'Claude 4.6 Sonnet' },
    { value: 'claude-sonnet-4.5', label: 'Claude 4.5 Sonnet' },
    { value: 'claude-haiku-4.5', label: 'Claude 4.5 Haiku' },
  ],
  google: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  ],
  xai: [
    { value: 'grok-4', label: 'Grok 4' },
    { value: 'grok-4-fast-reasoning', label: 'Grok 4 Fast Reasoning' },
    { value: 'grok-4-fast-non-reasoning', label: 'Grok 4 Fast (Non-Reasoning)' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
    { value: 'deepseek-r1', label: 'DeepSeek R1' },
  ],
  qwen: [
    { value: 'qwen-max', label: 'Qwen Max' },
    { value: 'qwen-flash', label: 'Qwen Flash' },
  ],
  moonshot: [
    { value: 'kimi-k2.5', label: 'Kimi K2.5' },
    { value: 'kimi-k2.5-thinking', label: 'Kimi K2.5 Thinking' },
  ],
  perplexity: [
    { value: 'sonar', label: 'Sonar' },
    { value: 'sonar-reasoning', label: 'Sonar Reasoning' },
    { value: 'sonar-pro', label: 'Sonar Pro' },
    { value: 'sonar-deep-research', label: 'Sonar Deep Research' },
  ],
  zhipu: [
    { value: 'glm-4.7', label: 'GLM-4.7' },
    { value: 'glm-4.6v', label: 'GLM-4.6V (Vision)' },
    { value: 'glm-4.6v-flash', label: 'GLM-4.6V Flash' },
  ],
  'black-forest-labs': [],
  suno: [],
  udio: [],
};

/**
 * Tier-based model access control.
 *
 * Maps subscription tiers to the models users can manually select.
 * This is separate from auto-mode routing (which also respects tiers).
 *
 * Tiers are cumulative: higher tiers include all lower tier models.
 * - hobby/free: Budget-friendly models only
 * - pro: Adds mid-tier models (Claude Sonnet, GPT-5.2, etc.)
 * - max/enterprise: All models including flagships
 */
// Economy tier: low-cost models (< $3/1M output tokens). Available on all tiers.
// Kimi K2.5 is excluded from free/hobby: $3/M output puts it in the balanced tier.
const ECONOMY_MODELS = [
  'gemini-3-flash-preview',
  'glm-4.7',
  'deepseek-chat',
  'glm-4.6v',
  'glm-4.6v-flash',
  'grok-4-fast-reasoning',
  'claude-haiku-4.5',
  'grok-4-fast-non-reasoning',
  'qwen-flash',
  'gpt-5-nano',
  'gpt-5.2-codex-low',
  'sonar',
] as const;

// Balanced tier: mid-range models ($1–15/1M output tokens). Pro and above.
// kimi-k2.5: Moonshot flagship at $0.60/$3.00 per M tokens, 262K context, multimodal.
const PRO_ADDITIONS = [
  'gpt-5.2',
  'gpt-5.2-codex-medium',
  'claude-sonnet-4.6',
  'claude-sonnet-4.5',
  'gemini-3-pro-preview',
  'qwen-max',
  'kimi-k2.5',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-deep-research',
] as const;

// Flagship tier: highest-capability models. Max and enterprise only.
// kimi-k2.5-thinking: Moonshot flagship + reasoning mode — requires max subscription.
const FLAGSHIP_ADDITIONS = [
  'claude-opus-4.6',
  'gpt-5-pro',
  'o3',
  'grok-4',
  'deepseek-r1',
  'kimi-k2.5-thinking',
  'gpt-5.2-codex-xhigh',
  'gpt-5.2-codex-high',
] as const;

export const TIER_ALLOWED_MODELS: Record<SubscriptionTier, string[]> = {
  free: [...ECONOMY_MODELS],
  hobby: [...ECONOMY_MODELS],
  pro: [...PRO_ADDITIONS, ...ECONOMY_MODELS],
  max: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
  enterprise: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
};

/**
 * Check if a model is allowed for a given subscription tier.
 * Returns true if the model is in the tier's allowed list.
 */
export function isModelAllowedForTier(modelId: string, tier: SubscriptionTier): boolean {
  const allowedModels = TIER_ALLOWED_MODELS[tier];
  return allowedModels?.includes(modelId) ?? false;
}

/**
 * Get the list of allowed models for a subscription tier.
 */
export function getAllowedModelsForTier(tier: SubscriptionTier): string[] {
  return TIER_ALLOWED_MODELS[tier] ?? TIER_ALLOWED_MODELS.free;
}

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
  'gpt-5.2-codex-low': 400_000,
  'gpt-5.2-codex-medium': 400_000,
  'gpt-5.2-codex-high': 400_000,
  'gpt-5.2-codex-xhigh': 400_000,
  'gpt-5-pro': 512_000, // GPT-5 Pro - flagship OpenAI model
  'gpt-5-nano': 128_000, // GPT-5 Nano - cheapest OpenAI model
  // Anthropic
  'claude-opus-4.6': 200_000,
  'claude-sonnet-4.6': 200_000,
  'claude-sonnet-4.5': 200_000,
  'claude-haiku-4.5': 200_000, // Claude Haiku 4.5 - cheapest Anthropic
  // Google (no Ultra tier exists in Gemini 3 API)
  'gemini-3-pro-preview': 2_000_000,
  'gemini-3-flash-preview': 1_000_000,
  // xAI
  'grok-4': 256_000,
  'grok-4-fast': 2_000_000, // Grok 4 Fast - cheapest xAI with 2M context
  'grok-4-fast-reasoning': 2_000_000,
  'grok-4-fast-non-reasoning': 2_000_000, // Per official xAI docs
  // DeepSeek
  'deepseek-chat': 128_000,
  'deepseek-r1': 128_000,
  // Qwen (via MuleRouter)
  'qwen-max': 128_000, // Flagship model
  'qwen-flash': 1_000_000, // 1M per MuleRouter docs
  // Moonshot K2.5 (thinking controlled via API parameter, not separate model)
  'kimi-k2.5': 256_000, // 262,144 per official docs
  'kimi-k2.5-thinking': 256_000, // Thinking variant used by Rust router
  // Perplexity
  sonar: 128_000,
  'sonar-reasoning': 128_000,
  'sonar-reasoning-pro': 128_000,
  'sonar-pro': 200_000,
  'sonar-deep-research': 128_000,
  // OpenAI
  o3: 200_000,
  // Image models
  'dall-e-3': 4000,
  'gpt-image-1': 4000,
  'gpt-image-1.5': 4000,
  'imagen-4': 4000,
  'imagen-4-ultra': 4000,
  'flux-1.1-pro': 4000,
  'flux-2-pro': 4000,
  'ideogram-2': 4000,
  // Video models
  'sora-2': 4000,
  'veo-3': 4000,
  // TTS models
  'tts-1': 4096,
  'tts-1-hd': 4096,
  // STT models
  'whisper-1': 0,
  // Music models
  'suno-v4': 4000,
  udio: 4000,
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
  modelType:
    | 'chat'
    | 'code'
    | 'reasoning'
    | 'multimodal'
    | 'image'
    | 'video'
    | 'search'
    | 'tts'
    | 'stt'
    | 'music';
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
    // Additional benchmark dimensions used by newer model releases
    sweBenchPro?: number;
    terminalBench2?: number;
    osWorldVerified?: number;
    gdpvalWinsOrTies?: number;
    ctfChallenges?: number;
    sweLancerIcDiamond?: number;
    aiderPolyglot?: number;
    tau2Telecom?: number;
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
    name: 'Auto (Economy)',
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
    apiModelId: 'gpt-5.2',
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
      // OpenAI has not published a standalone GPT-5.2 benchmark table yet.
      // Use latest official GPT-5.2/GPT-5 family published metrics as proxy.
      swebench: 80.0, // SWE-bench Verified (GPT-5.2 Thinking)
      sweBenchPro: 55.6, // SWE-Bench Pro (GPT-5.2/GPT-5.2-Codex comparator table)
      aiderPolyglot: 88.0, // GPT-5 high
      mmlu: 93.2, // Retained proxy for general routing (no official 5.2 MMLU published)
      gpqa: 92.4, // GPQA Diamond (GPT-5.2 Thinking)
      aime: 100.0, // AIME 2025 (GPT-5.2 Thinking)
      gdpvalWinsOrTies: 70.9, // GDPval
      tau2Telecom: 96.7, // τ²-bench telecom (GPT-5 high)
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Agentic Tasks', 'Complex Reasoning', 'Research'],
    released: 'December 2025',
  },
  'gpt-5.2-codex-low': {
    id: 'gpt-5.2-codex-low',
    apiModelId: 'gpt-5.2-codex-low',
    name: 'GPT-5.2 Codex (Low)',
    provider: 'openai',
    modelType: 'code',
    contextWindow: 400_000,
    inputCost: 1.25,
    outputCost: 10.0,
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
      codeExecution: true,
    },
    benchmarks: {
      // Public GPT-5.2-Codex benchmark disclosures are reported at xhigh effort.
      swebench: 56.8, // Mapped from SWE-Bench Pro (Public)
      sweBenchPro: 56.8,
      terminalBench2: 77.3,
      osWorldVerified: 64.7,
      gdpvalWinsOrTies: 70.9,
      ctfChallenges: 77.6,
      sweLancerIcDiamond: 81.4,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Agentic Coding', 'Tool Use'],
    released: '2026',
  },
  'gpt-5.2-codex-medium': {
    id: 'gpt-5.2-codex-medium',
    apiModelId: 'gpt-5.2-codex-medium',
    name: 'GPT-5.2 Codex (Medium)',
    provider: 'openai',
    modelType: 'code',
    contextWindow: 400_000,
    inputCost: 1.25,
    outputCost: 10.0,
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
      codeExecution: true,
    },
    benchmarks: {
      swebench: 56.8, // Mapped from SWE-Bench Pro (Public)
      sweBenchPro: 56.8,
      terminalBench2: 77.3,
      osWorldVerified: 64.7,
      gdpvalWinsOrTies: 70.9,
      ctfChallenges: 77.6,
      sweLancerIcDiamond: 81.4,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Agentic Coding', 'Tool Use'],
    released: '2026',
  },
  'gpt-5.2-codex-high': {
    id: 'gpt-5.2-codex-high',
    apiModelId: 'gpt-5.2-codex-high',
    name: 'GPT-5.2 Codex (High)',
    provider: 'openai',
    modelType: 'code',
    contextWindow: 400_000,
    inputCost: 1.25,
    outputCost: 10.0,
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
      codeExecution: true,
    },
    benchmarks: {
      swebench: 56.8, // Mapped from SWE-Bench Pro (Public)
      sweBenchPro: 56.8,
      terminalBench2: 77.3,
      osWorldVerified: 64.7,
      gdpvalWinsOrTies: 70.9,
      ctfChallenges: 77.6,
      sweLancerIcDiamond: 81.4,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Coding', 'Agentic Coding', 'Tool Use'],
    released: '2026',
  },
  'gpt-5.2-codex-xhigh': {
    id: 'gpt-5.2-codex-xhigh',
    apiModelId: 'gpt-5.2-codex-xhigh',
    name: 'GPT-5.2 Codex (XHigh)',
    provider: 'openai',
    modelType: 'code',
    contextWindow: 400_000,
    inputCost: 1.25,
    outputCost: 10.0,
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
      codeExecution: true,
    },
    benchmarks: {
      swebench: 56.8, // Mapped from SWE-Bench Pro (Public)
      sweBenchPro: 56.8,
      terminalBench2: 77.3,
      osWorldVerified: 64.7,
      gdpvalWinsOrTies: 70.9,
      ctfChallenges: 77.6,
      sweLancerIcDiamond: 81.4,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Coding', 'Agentic Coding', 'Tool Use'],
    released: '2026',
  },
  'gpt-5-pro': {
    id: 'gpt-5-pro',
    apiModelId: 'gpt-5.2-pro',
    name: 'GPT-5 Pro',
    provider: 'openai',
    modelType: 'reasoning',
    contextWindow: 512_000, // 512K context - flagship model
    inputCost: 5.0, // $5/1M input
    outputCost: 30.0, // $30/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full function calling support
      vision: true, // Native vision in GPT-5 series
      json: true, // Structured outputs
      thinking: true, // Advanced reasoning mode
      computerUse: true, // Full computer use support
      agentic: true, // Optimized for multi-step autonomous tasks
      imageGen: false, // Separate DALL-E model
      videoGen: false, // Separate Sora model
      search: true, // Web browsing capability
      research: true, // Deep research mode
      codeExecution: true, // Code Interpreter sandbox
    },
    benchmarks: {
      swebench: 75.4, // SWE-bench verified (Jan 2026)
      humaneval: 98.2,
      mmlu: 94.8,
      gpqa: 93.8, // GPQA Diamond (high reasoning)
      aime: 94.6, // AIME 2025
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Complex Research', 'Hard Reasoning', 'Long-form Analysis', 'Enterprise Tasks'],
    released: 'January 2026',
  },
  'gpt-5-nano': {
    id: 'gpt-5-nano',
    apiModelId: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    provider: 'openai',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 0.05, // $0.05/1M input - CHEAPEST OpenAI
    outputCost: 0.4, // $0.40/1M output
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: true, // Vision supported
      json: true, // Structured outputs
      thinking: false, // No reasoning mode
      computerUse: false, // Not available
      agentic: false, // Not optimized for agentic tasks
      imageGen: false,
      videoGen: false,
      search: false, // No web browsing
      research: false, // No deep research
      codeExecution: true, // Code Interpreter available
    },
    benchmarks: {
      swebench: 18.0,
      humaneval: 80.0,
      mmlu: 78.0,
      gpqa: 35.0,
      aime: 20.0,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Simple Tasks', 'Classification', 'Summarization', 'High Volume'],
    released: 'September 2025',
  },

  // ============================================
  // ANTHROPIC MODELS
  // Source: https://docs.anthropic.com/en/docs/models-overview
  // Capabilities verified January 2026
  // ============================================
  'claude-opus-4.6': {
    id: 'claude-opus-4.6',
    apiModelId: 'claude-opus-4-6',
    name: 'Claude 4.6 Opus',
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
      swebench: 80.9, // BEST for coding (Jan 2026) - First to exceed 80%
      humaneval: 97.2,
      mmlu: 89.5, // MMLU-Pro
      gpqa: 89.0, // GPQA Diamond
      aime: 93.0, // AIME 2025 (with thinking)
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Coding', 'Complex Analysis', 'Computer Use', 'Long Documents'],
    released: 'November 2025',
  },
  'claude-sonnet-4.6': {
    id: 'claude-sonnet-4.6',
    apiModelId: 'claude-sonnet-4-6',
    name: 'Claude 4.6 Sonnet',
    provider: 'anthropic',
    modelType: 'code',
    contextWindow: 200_000,
    inputCost: 3.0, // $3/1M input
    outputCost: 15.0, // $15/1M output
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true, // Extended thinking + adaptive thinking
      computerUse: true,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: {
      swebench: 78.5,
      humaneval: 96.2,
      mmlu: 89.5,
      gpqa: 76.0,
      aime: 88.0,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Tool Use', 'Computer Use', 'Agentic Tasks'],
    released: 'February 2026',
  },
  'claude-sonnet-4.5': {
    id: 'claude-sonnet-4.5',
    apiModelId: 'claude-sonnet-4-5-20250929',
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
      swebench: 77.2, // Second best for coding (Jan 2026)
      humaneval: 95.8,
      mmlu: 89.5,
      gpqa: 75.2,
      aime: 87.0, // AIME 2025
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Tool Use', 'Computer Use'],
    released: 'October 2025',
  },
  'claude-haiku-4.5': {
    id: 'claude-haiku-4.5',
    apiModelId: 'claude-haiku-4-5-20251001',
    name: 'Claude 4.5 Haiku',
    provider: 'anthropic',
    modelType: 'chat',
    contextWindow: 200_000,
    inputCost: 1.0, // $1/1M input - Cheapest Anthropic
    outputCost: 5.0, // $5/1M output
    capabilities: {
      streaming: true,
      tools: true, // Full tool use support
      vision: true, // Native vision
      json: true, // Structured outputs
      thinking: false, // No extended thinking
      computerUse: false, // No computer use
      agentic: true, // Anthropic parallel tool execution, sub-agent orchestration
      imageGen: false,
      videoGen: false,
      search: false, // No native web search
      research: false, // No built-in research
      codeExecution: false, // No sandbox
    },
    benchmarks: {
      swebench: 45.0,
      humaneval: 88.0,
      mmlu: 85.0,
      gpqa: 55.0,
      aime: 40.0,
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Agentic Tasks', 'Quick Tasks', 'Simple Queries', 'High Volume', 'Cost-Sensitive'],
    released: 'October 2025',
  },

  // ============================================
  // GOOGLE MODELS
  // Source: https://ai.google.dev/gemini-api/docs/models
  // Capabilities verified January 2026
  // NOTE: Gemini 3 only has Pro and Flash tiers (no Ultra tier exists in API)
  // ============================================
  'gemini-3-pro-preview': {
    id: 'gemini-3-pro-preview',
    apiModelId: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    modelType: 'reasoning',
    contextWindow: 2_000_000, // 2M context window
    inputCost: 2.0, // $2.00/1M input
    outputCost: 12.0, // $12.00/1M output
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
      swebench: 74.2, // SWE-bench verified (Jan 2026)
      humaneval: 93.5,
      mmlu: 89.5, // MMLU-Pro, Arena ELO: 1501 (top)
      gpqa: 91.9, // GPQA Diamond
      aime: 95.0, // AIME 2025
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Long Context', 'Research', 'Multimodal', 'Code Execution'],
    released: 'December 2025',
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    apiModelId: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    modelType: 'chat',
    contextWindow: 1_000_000, // 1M context
    inputCost: 0.5, // $0.50/1M input (verified Jan 2026)
    outputCost: 3.0, // $3.00/1M output (verified Jan 2026)
    capabilities: {
      streaming: true,
      tools: true, // Function calling supported
      vision: true, // Multimodal vision
      json: true, // JSON mode
      thinking: false, // Flash Thinking exists but limited
      computerUse: false, // Not available
      agentic: true, // Google "Agentic Vision" feature, 78% SWE-bench
      imageGen: false,
      videoGen: false,
      search: true, // Search grounding available
      research: false, // No deep research
      codeExecution: true, // Code execution sandbox
    },
    benchmarks: {
      swebench: 76.2, // SWE-bench verified (Jan 2026) - outperforms Pro!
      humaneval: 91.0,
      mmlu: 88.6, // MMLU-Pro
      gpqa: 60.0, // GPQA Diamond
      aime: 88.0, // AIME 2025 (Flash Thinking)
    },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Agentic Tasks', 'Speed', 'Cost-Sensitive', 'Long Context'],
    released: 'December 2025',
  },

  // ============================================
  // XAI MODELS
  // Source: https://docs.x.ai/docs
  // Capabilities verified January 2026
  // NOTE: Vision requires separate grok-2-vision model
  // ============================================
  'grok-4': {
    id: 'grok-4',
    apiModelId: 'grok-4-0709',
    name: 'Grok 4',
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

  // Grok 4 Fast - Economy model with massive context (latest)
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
  'deepseek-chat': {
    id: 'deepseek-chat',
    apiModelId: 'deepseek-chat',
    name: 'DeepSeek Chat (V3)',
    provider: 'deepseek',
    modelType: 'code',
    contextWindow: 128_000,
    inputCost: 0.28, // $0.28/1M input - Very cheap
    outputCost: 0.42, // $0.42/1M output
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
      swebench: 68.8, // SWE-bench verified (Jan 2026) - Thinking mode
      humaneval: 92.8,
      mmlu: 85.0, // MMLU-Pro
      gpqa: 68.3,
      aime: 70.0, // AIME 2025
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Cost-Effective', 'Technical Tasks', 'Reasoning'],
    released: 'January 2026',
  },

  // ============================================
  // QWEN MODELS (via MuleRouter)
  // Source: https://www.mulerouter.ai/collections/qwen
  // MuleRouter provides OpenAI-compatible API for Qwen models
  // ============================================

  'qwen-max': {
    id: 'qwen-max',
    apiModelId: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen',
    modelType: 'reasoning',
    contextWindow: 128_000, // 252K per MuleRouter docs
    inputCost: 1.2, // $1.2/1M for 0-32K tokens
    outputCost: 6.0, // $6/1M for 0-32K tokens
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
      codeExecution: true,
    },
    benchmarks: { swebench: 58, humaneval: 93, mmlu: 88, gpqa: 65, aime: 60 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Complex Reasoning', 'Multilingual', 'Research'],
    released: 'January 2026',
  },

  // ============================================
  // NEW MODELS (January 2026 Update)
  // ============================================

  // OpenAI o3
  o3: {
    id: 'o3',
    apiModelId: 'o3',
    name: 'OpenAI o3',
    provider: 'openai',
    modelType: 'reasoning',
    contextWindow: 200_000,
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
      search: false,
      research: false,
      codeExecution: true,
    },
    benchmarks: { swebench: 65, humaneval: 96, mmlu: 92, gpqa: 78, aime: 85 },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Complex Reasoning', 'Math', 'Science', 'Hard Problems'],
    released: 'January 2026',
  },

  // xAI Grok 4 Fast (Non-Reasoning) - formerly misnamed as "mini"
  'grok-4-fast-non-reasoning': {
    id: 'grok-4-fast-non-reasoning',
    apiModelId: 'grok-4-fast-non-reasoning',
    name: 'Grok 4 Fast (Non-Reasoning)',
    provider: 'xai',
    modelType: 'chat',
    contextWindow: 2_000_000, // 2M context per official docs
    inputCost: 0.2, // $0.20/1M per official docs
    outputCost: 0.5, // $0.50/1M per official docs
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false, // Non-reasoning variant
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true, // X/Twitter search available
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 35, humaneval: 75, mmlu: 78, gpqa: 42, aime: 30 },
    speed: 'very-fast',
    quality: 'fair',
    qualityTier: 'fast',
    bestFor: ['Quick Tasks', 'Simple Queries', 'Long Context', 'Budget Usage'],
    released: 'January 2026',
  },

  // xAI Grok 4 Fast Reasoning
  'grok-4-fast-reasoning': {
    id: 'grok-4-fast-reasoning',
    apiModelId: 'grok-4-fast-reasoning',
    name: 'Grok 4 Fast Reasoning',
    provider: 'xai',
    modelType: 'reasoning',
    contextWindow: 2_000_000,
    inputCost: 0.2,
    outputCost: 0.5,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true, // xAI Agent Tools API, reduced hallucinations
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
      codeExecution: true,
    },
    benchmarks: { swebench: 48, humaneval: 85, mmlu: 85, gpqa: 60, aime: 55 },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['Agentic Tasks', 'Reasoning', 'Real-time Data', 'Long Context'],
    released: 'January 2026',
  },

  // DeepSeek R1
  'deepseek-r1': {
    id: 'deepseek-r1',
    apiModelId: 'deepseek-reasoner',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    modelType: 'reasoning',
    contextWindow: 128_000,
    inputCost: 0.55,
    outputCost: 1.68,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 55, humaneval: 90, mmlu: 87, gpqa: 68, aime: 75 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Reasoning', 'Math', 'Coding', 'Budget Reasoning'],
    released: 'January 2025',
  },

  'qwen-flash': {
    id: 'qwen-flash',
    apiModelId: 'qwen-flash',
    name: 'Qwen Flash',
    provider: 'qwen',
    modelType: 'chat',
    contextWindow: 1_000_000, // 1M per MuleRouter docs
    inputCost: 0.05, // $0.05/1M for 0-256K tokens
    outputCost: 0.4, // $0.40/1M for 0-256K tokens
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
      codeExecution: false,
    },
    benchmarks: { swebench: 25, humaneval: 70, mmlu: 75, gpqa: 35, aime: 25 },
    speed: 'very-fast',
    quality: 'fair',
    qualityTier: 'fast',
    bestFor: ['Quick Tasks', 'Budget Usage', 'Multilingual', 'Long Context'],
    released: 'November 2025',
  },

  // ============================================
  // MOONSHOT K2.5 MODELS
  // Source: https://platform.moonshot.cn/docs
  // NOTE: K2.5 is the latest model with native multimodal support and thinking mode
  // Thinking mode is controlled via API parameter, not separate model IDs
  // ============================================
  'kimi-k2.5': {
    id: 'kimi-k2.5',
    apiModelId: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    modelType: 'multimodal',
    contextWindow: 256_000, // 262,144 per official docs
    inputCost: 0.6, // $0.60/1M (platform.moonshot.ai, verified Feb 2026)
    outputCost: 3.0, // $3.00/1M (platform.moonshot.ai, verified Feb 2026)
    capabilities: {
      streaming: true,
      tools: true,
      vision: true, // Native multimodal
      json: true,
      thinking: true, // Controlled via {"thinking": {"type": "enabled"}} parameter
      computerUse: false,
      agentic: true, // State-of-the-art Agent performance
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 55, humaneval: 92, mmlu: 88, gpqa: 84, aime: 99 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Vision', 'Math', 'Reasoning', 'Agent Tasks', 'Multimodal'],
    released: 'January 2026',
  },
  // Kimi K2.5 Thinking - reasoning variant used by Rust router
  // Maps to same kimi-k2.5 API model with {"thinking":{"type":"enabled"}} parameter.
  // Placed in max/enterprise only because extended thinking generates more tokens.
  'kimi-k2.5-thinking': {
    id: 'kimi-k2.5-thinking',
    apiModelId: 'kimi-k2.5',
    name: 'Kimi K2.5 Thinking',
    provider: 'moonshot',
    modelType: 'reasoning',
    contextWindow: 256_000,
    inputCost: 0.6, // $0.60/1M — same underlying model as kimi-k2.5
    outputCost: 3.0, // $3.00/1M (platform.moonshot.ai, verified Feb 2026)
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
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 55, humaneval: 92, mmlu: 88, gpqa: 84, aime: 99 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Math', 'Reasoning', 'Complex Analysis', 'Agent Tasks'],
    released: 'January 2026',
  },

  // ============================================
  // ZHIPUAI MODELS (智谱AI / BigModel)
  // Source: https://docs.z.ai/guides/llm/glm-4.7
  // GLM-4.7 (December 2025): Flagship coding model
  // SWE-bench Verified: 73.8%, LiveCodeBench v6: 84.9%, AIME 2025: 95.7%
  // ============================================
  'glm-4.7': {
    id: 'glm-4.7',
    apiModelId: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'zhipu' as Provider,
    modelType: 'code',
    contextWindow: 128_000,
    inputCost: 0.14, // ~¥1/M tokens ($0.14/M)
    outputCost: 0.42, // ~¥3/M tokens ($0.42/M)
    capabilities: {
      streaming: true,
      tools: true,
      vision: false, // Use glm-4.6v for vision
      json: true,
      thinking: true, // Supports thinking-before-acting
      computerUse: false,
      agentic: true, // Optimized for agent frameworks (Claude Code, Cline, etc.)
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    // January 2026 benchmarks from z.ai blog and SWE-bench
    benchmarks: { swebench: 73.8, humaneval: 85, mmlu: 88, gpqa: 85.7, aime: 95.7 },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Coding', 'Agent Workflows', 'Open-Weight Alternative', 'Chinese Language'],
    released: 'December 2025',
  },
  // GLM-4.6V (December 2025): Native multimodal with tool calling
  // 128K context, arbitrary resolution support, MIT licensed
  'glm-4.6v': {
    id: 'glm-4.6v',
    apiModelId: 'glm-4.6v',
    name: 'GLM-4.6V (Vision)',
    provider: 'zhipu' as Provider,
    modelType: 'multimodal',
    contextWindow: 128_000,
    inputCost: 0.14, // ¥1/M tokens (~$0.14/M) - 50% cheaper than 4.5V
    outputCost: 0.42, // ¥3/M tokens (~$0.42/M)
    capabilities: {
      streaming: true,
      tools: true, // Native function calling with images!
      vision: true, // Vision capable - arbitrary resolution support
      json: true,
      thinking: true,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 68, humaneval: 82, mmlu: 86, gpqa: 58, aime: 75 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Vision + Tool Use', 'Image Analysis', 'Frontend Automation', 'Multimodal'],
    released: 'December 2025',
  },
  // GLM-4.6V-Flash (December 2025): 9B lightweight vision model - FREE
  // CRITICAL: This is a FREE model - prioritize in routing!
  'glm-4.6v-flash': {
    id: 'glm-4.6v-flash',
    apiModelId: 'glm-4.6v-flash',
    name: 'GLM-4.6V Flash (FREE)',
    provider: 'zhipu' as Provider,
    modelType: 'multimodal',
    contextWindow: 128_000,
    inputCost: 0.0, // FREE for commercial use (open-source MIT)
    outputCost: 0.0, // FREE - ZERO COST!
    capabilities: {
      streaming: true,
      tools: true, // Native function calling with images!
      vision: true, // 9B parameter vision model
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false, // Not optimized for long agentic tasks
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: { swebench: 45, humaneval: 75, mmlu: 78, gpqa: 40, aime: 45 },
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['FREE Model', 'Vision Tasks', 'Simple Queries', 'High Volume', 'Budget Usage'],
    released: 'December 2025',
  },

  // ============================================
  // PERPLEXITY MODELS
  // ============================================
  sonar: {
    id: 'sonar',
    apiModelId: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    modelType: 'search',
    contextWindow: 128_000,
    inputCost: 1.0,
    outputCost: 1.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
      codeExecution: false,
    },
    benchmarks: { mmlu: 75 },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Web Search', 'Quick Research', 'Citations'],
    released: 'January 2026',
  },
  'sonar-reasoning': {
    id: 'sonar-reasoning',
    apiModelId: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    provider: 'perplexity',
    modelType: 'search',
    contextWindow: 128_000,
    inputCost: 1.0,
    outputCost: 5.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: false,
      codeExecution: false,
    },
    benchmarks: { mmlu: 82, gpqa: 55 },
    speed: 'medium',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['Search + Reasoning', 'Analysis', 'Citations'],
    released: 'January 2026',
  },
  'sonar-reasoning-pro': {
    id: 'sonar-reasoning-pro',
    apiModelId: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    modelType: 'search',
    contextWindow: 128_000,
    inputCost: 2.0,
    outputCost: 8.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
      codeExecution: false,
    },
    benchmarks: { mmlu: 85, gpqa: 62 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Deep Research', 'Complex Analysis', 'Citations'],
    released: 'January 2026',
  },
  'sonar-pro': {
    id: 'sonar-pro',
    apiModelId: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    modelType: 'search',
    contextWindow: 200_000,
    inputCost: 3.0,
    outputCost: 15.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
      codeExecution: false,
    },
    benchmarks: { mmlu: 88 },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Professional Research', 'Long Context Search'],
    released: 'January 2026',
  },
  'sonar-deep-research': {
    id: 'sonar-deep-research',
    apiModelId: 'sonar-deep-research',
    name: 'Sonar Deep Research',
    provider: 'perplexity',
    modelType: 'search',
    contextWindow: 128_000,
    inputCost: 2.0,
    outputCost: 8.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: true,
      thinking: true,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: true,
      research: true,
      codeExecution: false,
    },
    benchmarks: { mmlu: 88 },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Deep Research', 'Multi-Source Synthesis', 'Comprehensive Analysis'],
    released: 'January 2026',
  },

  // ============================================
  // IMAGE GENERATION MODELS
  // ============================================
  'dall-e-3': {
    id: 'dall-e-3',
    apiModelId: 'dall-e-3',
    name: 'DALL-E 3',
    provider: 'openai',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0, // Per-image pricing
    outputCost: 40.0, // $0.04/image standard = $40/1000 images
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Image Generation', 'Creative Art', 'Illustrations'],
    released: 'November 2023',
  },
  'gpt-image-1': {
    id: 'gpt-image-1',
    apiModelId: 'gpt-image-1',
    name: 'GPT Image 1',
    provider: 'openai',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 40.0, // $0.04/image
    capabilities: {
      streaming: false,
      tools: false,
      vision: true,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Image Generation', 'Image Editing', 'Text in Images'],
    released: 'March 2025',
  },
  'gpt-image-1.5': {
    id: 'gpt-image-1.5',
    apiModelId: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    provider: 'openai',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 80.0, // $0.08/image HD
    capabilities: {
      streaming: false,
      tools: false,
      vision: true,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['HD Image Generation', 'Professional Art', 'Detailed Images'],
    released: 'January 2026',
  },
  'imagen-4': {
    id: 'imagen-4',
    apiModelId: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    provider: 'google',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 40.0,
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Photorealistic Images', 'Creative Content'],
    released: 'January 2026',
  },
  'imagen-4-ultra': {
    id: 'imagen-4-ultra',
    apiModelId: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4 Ultra',
    provider: 'google',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 80.0,
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Ultra HD Images', 'Professional Quality'],
    released: 'January 2026',
  },
  'flux-1.1-pro': {
    id: 'flux-1.1-pro',
    apiModelId: 'flux-1.1-pro',
    name: 'Flux 1.1 Pro',
    provider: 'black-forest-labs',
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 40.0, // $0.04/image
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Photorealistic Images', 'Fast Generation'],
    released: 'January 2026',
  },
  'flux-2-pro': {
    id: 'flux-2-pro',
    apiModelId: 'flux-2-pro',
    name: 'Flux 2 Pro',
    provider: 'black-forest-labs', // Black Forest Labs (same as flux-1.1-pro)
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 60.0, // $0.06/image
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Professional Images', 'High Quality'],
    released: 'January 2026',
  },
  'ideogram-2': {
    id: 'ideogram-2',
    apiModelId: 'ideogram-2.0',
    name: 'Ideogram 2.0',
    provider: 'managed_cloud', // Routed via ManagedCloud proxy (Ideogram)
    modelType: 'image',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 20.0, // $0.02/image
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: true,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Text in Images', 'Logos', 'Typography'],
    released: 'January 2026',
  },

  // ============================================
  // VIDEO GENERATION MODELS
  // ============================================
  'sora-2': {
    id: 'sora-2',
    apiModelId: 'sora-2',
    name: 'Sora 2',
    provider: 'openai',
    modelType: 'video',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 100.0, // ~$0.10/sec of video
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: true,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Video Generation', 'Cinematic Content', 'Up to 35s clips'],
    released: 'January 2026',
  },
  'veo-3': {
    id: 'veo-3',
    apiModelId: 'veo-3.1-generate-preview',
    name: 'Veo 3',
    provider: 'google',
    modelType: 'video',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 750.0, // $0.75/sec
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: true,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['Professional Video', 'High Quality Clips'],
    released: 'January 2026',
  },

  // ============================================
  // TEXT-TO-SPEECH MODELS
  // ============================================
  'tts-1': {
    id: 'tts-1',
    apiModelId: 'tts-1',
    name: 'OpenAI TTS Standard',
    provider: 'openai',
    modelType: 'tts',
    contextWindow: 4096,
    inputCost: 15.0, // $15/1M chars
    outputCost: 0.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['Voice Generation', 'Narration', 'Accessibility'],
    released: 'November 2023',
  },
  'tts-1-hd': {
    id: 'tts-1-hd',
    apiModelId: 'tts-1-hd',
    name: 'OpenAI TTS HD',
    provider: 'openai',
    modelType: 'tts',
    contextWindow: 4096,
    inputCost: 30.0, // $30/1M chars
    outputCost: 0.0,
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Professional Audio', 'High Quality Voice'],
    released: 'November 2023',
  },

  // ============================================
  // SPEECH-TO-TEXT MODELS
  // ============================================
  'whisper-1': {
    id: 'whisper-1',
    apiModelId: 'whisper-1',
    name: 'Whisper',
    provider: 'openai',
    modelType: 'stt',
    contextWindow: 0,
    inputCost: 0.006, // $0.006/min
    outputCost: 0.0,
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'fast',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Transcription', 'Speech Recognition', 'Multi-language'],
    released: 'September 2022',
  },

  // ============================================
  // MUSIC GENERATION MODELS
  // ============================================
  'suno-v4': {
    id: 'suno-v4',
    apiModelId: 'suno-v4',
    name: 'Suno V4',
    provider: 'suno',
    modelType: 'music',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 0.0, // Credit-based
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Music Generation', 'Songs with Vocals', 'Full Productions'],
    released: 'Late 2025',
  },
  udio: {
    id: 'udio',
    apiModelId: 'udio',
    name: 'Udio',
    provider: 'udio',
    modelType: 'music',
    contextWindow: 4000,
    inputCost: 0.0,
    outputCost: 0.0, // Credit-based
    capabilities: {
      streaming: false,
      tools: false,
      vision: false,
      json: false,
      thinking: false,
      computerUse: false,
      agentic: false,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'balanced',
    bestFor: ['Music Generation', 'Professional Audio', 'Stem Control'],
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
