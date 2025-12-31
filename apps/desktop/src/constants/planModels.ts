import type { PlanTier } from '../lib/supabase';

/**
 * Model Tier Strategy - December 2025
 *
 * SPEED TIER (Hobby $10/month = $3.50 credit):
 * Ultra-fast, ultra-cheap models optimized for quick tasks
 * - GPT-5 Nano: $0.05/$0.40 (cheapest)
 * - Gemini 2.0 Flash: $0.10/$0.40 (very cheap)
 * - DeepSeek V3: $0.028/$0.42 (ultra cheap)
 * - Devstral Small: $0.10/$0.30 (cheap coding)
 * - Grok 3 Mini: $0.30/$0.50 (cheap general)
 * - Claude Haiku 4.5: $1.00/$5.00 (best quality/price)
 * - Llama 4: $0/$0 (free local)
 *
 * BALANCED TIER (Pro $29.99/month = $12 credit):
 * Good balance of speed and quality for everyday tasks
 * - GPT-5 Mini: $0.25/$2.00 (good balance)
 * - Gemini 3 Flash: $0.10/$0.40 (fast)
 * - Gemini 3 Pro: $1.50/$6.00 (good reasoning)
 * - Claude Sonnet 4.5: $3.00/$15.00 (best coding)
 * - GPT-5.2 Chat: $4.00/$12.00 (efficient)
 * - Grok 4.1 Fast: $4.00/$12.00 (2M context)
 * - Qwen3 Max: $2.50/$10.00 (reasoning)
 * - Kimi K2 Thinking: $1.50/$6.00 (reasoning)
 *
 * REASONING TIER (Max $299.99/month = $150 credit):
 * Deep thinking and complex analysis for power users
 * - Claude Opus 4.5: $5.00/$25.00 (advanced reasoning - updated Dec 2025)
 * - GPT-5.1 Thinking: $7.00/$21.00 (thinking mode)
 * - GPT-5.2 Pro: $10.00/$30.00 (most capable)
 * - Gemini 3 Deep Think: $3.00/$12.00 (advanced reasoning)
 * - GPT-5.2 Codex: $8.00/$24.00 (agentic coding)
 * - GPT-5.1 Codex Max: $8.00/$24.00 (extended context)
 * - GPT-5.1: $5.50/$16.50 (flagship)
 * - GPT-5.2: $6.00/$18.00 (flagship)
 * - Grok 4.1: $5.50/$16.50 (enhanced)
 */
export const PLAN_MODEL_RESTRICTIONS: Record<PlanTier, string[]> = {
  // Free: No paid model access - only local models
  free: ['llama4-maverick'],

  // SPEED TIER: Ultra-fast, ultra-cheap models
  // Budget: $10/month = ~$3.50 credit
  hobby: [
    // Ultra-cheap speed models (December 2025)
    'gpt-5-nano', // $0.05/$0.40 - cheapest OpenAI
    'gpt-5-nano', // $0.25/$2.00 - good balance
    'gemini-2-flash', // $0.10/$0.40 - very cheap
    'gemini-3-flash', // $0.10/$0.40 - essentially free
    'deepseek-v3', // $0.028/$0.42 - ultra cheap
    'devstral-small', // $0.10/$0.30 - cheap coding
    'grok-3-mini', // $0.30/$0.50 - cheap general
    'claude-haiku-4-5', // $1/$5 - best quality/price ratio
    'llama4-maverick', // $0/$0 - free local
  ],

  // BALANCED TIER: Good balance of speed and quality
  // Budget: $29.99/month = $12 credit
  pro: [
    // All Speed tier models
    'gpt-5-nano',
    'gpt-5-nano',
    'gemini-2-flash',
    'gemini-3-flash',
    'deepseek-v3',
    'devstral-small',
    'grok-3-mini',
    'claude-haiku-4-5',
    'llama4-maverick',
    // Balanced tier additions
    'gemini-3-pro', // $1.50/$6 - good reasoning
    'kimi-k2-thinking', // $1.50/$6 - reasoning model
    'qwen3-max', // $2.50/$10 - reasoning model
    'claude-sonnet-4-5', // $3/$15 - best for coding
    'gpt-5.1-chat-latest', // $4/$12 - fast chat
    'gpt-5.2-chat-latest', // $4/$12 - improved fast chat
    'grok-4.1-fast', // $4/$12 - 2M context
    'grok-4.1', // $5.50/$16.50 - enhanced reasoning
  ],

  // REASONING TIER: Deep thinking and complex analysis
  // Budget: $299.99/month = $150 credit
  max: [
    // All Balanced tier models
    'gpt-5-nano',
    'gpt-5-nano',
    'gemini-2-flash',
    'gemini-3-flash',
    'deepseek-v3',
    'devstral-small',
    'grok-3-mini',
    'claude-haiku-4-5',
    'llama4-maverick',
    'gemini-3-pro',
    'kimi-k2-thinking',
    'qwen3-max',
    'claude-sonnet-4-5',
    'gpt-5.1-chat-latest',
    'gpt-5.2-chat-latest',
    'grok-4.1-fast',
    'grok-4.1',
    // Reasoning tier additions - Flagship models
    'gpt-5.1', // $5.50/$16.50 - flagship
    'gpt-5.2', // $6/$18 - flagship
    // Deep Reasoning models
    'claude-opus-4-5', // $5/$25 - advanced reasoning (Dec 2025 pricing)
    'gpt-5.1-thinking', // $7/$21 - thinking mode
    'gpt-5.2-pro', // $10/$30 - most capable
    'gemini-3-deep-think', // $3/$12 - advanced reasoning
    // Agentic coding models
    'gpt-5.2-codex', // $8/$24 - agentic coding
    'gpt-5.1-codex-max', // $8/$24 - extended context coding
  ],

  // Enterprise: Everything including all premium models
  enterprise: [
    // All Reasoning tier models
    'gpt-5-nano',
    'gpt-5-nano',
    'gemini-2-flash',
    'gemini-3-flash',
    'deepseek-v3',
    'devstral-small',
    'grok-3-mini',
    'claude-haiku-4-5',
    'llama4-maverick',
    'gemini-3-pro',
    'kimi-k2-thinking',
    'qwen3-max',
    'claude-sonnet-4-5',
    'gpt-5.1-chat-latest',
    'gpt-5.2-chat-latest',
    'grok-4.1-fast',
    'grok-4.1',
    'gpt-5.1',
    'gpt-5.2',
    'claude-opus-4-5',
    'gpt-5.1-thinking',
    'gpt-5.2-pro',
    'gemini-3-deep-think',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    // Enterprise has access to all models with custom limits
  ],
};

/**
 * Default models per plan tier
 * Optimized for cost-efficiency within each tier
 */
export const PLAN_DEFAULT_MODELS: Record<PlanTier, Record<string, string>> = {
  // Free: Local only
  free: {
    openai: '',
    anthropic: '',
    google: '',
    ollama: 'llama4-maverick',
    xai: '',
    deepseek: '',
    qwen: '',
    mistral: '',
    moonshot: '',
  },

  // SPEED TIER: Ultra-cheap defaults
  hobby: {
    openai: 'gpt-5-nano', // $0.05/$0.40 - cheapest
    anthropic: 'claude-haiku-4-5', // $1/$5 - best quality/price
    google: 'gemini-2-flash', // $0.10/$0.40 - ultra cheap
    ollama: 'llama4-maverick', // Free local
    xai: 'grok-3-mini', // $0.30/$0.50 - cheap
    deepseek: 'deepseek-v3', // $0.028/$0.42 - ultra cheap
    qwen: '',
    mistral: 'devstral-small', // $0.10/$0.30 - cheap coding
    moonshot: '',
  },

  // BALANCED TIER: Good balance defaults
  pro: {
    openai: 'gpt-5-nano', // $0.05/$0.40 - cheapest OpenAI model
    anthropic: 'claude-sonnet-4-5', // $3/$15 - best coding
    google: 'gemini-3-pro', // $1.50/$6 - good reasoning
    ollama: 'llama4-maverick',
    xai: 'grok-4.1-fast', // $4/$12 - 2M context
    deepseek: 'deepseek-v3', // $0.028/$0.42 - still available
    qwen: 'qwen3-max', // $2.50/$10 - reasoning
    mistral: 'devstral-small',
    moonshot: 'kimi-k2-thinking', // $1.50/$6 - reasoning
  },

  // REASONING TIER: Premium defaults for deep thinking
  max: {
    openai: 'gpt-5.2', // $6/$18 - flagship
    anthropic: 'claude-opus-4-5', // $5/$25 - deep reasoning
    google: 'gemini-3-deep-think', // $3/$12 - thinking
    ollama: 'llama4-maverick',
    xai: 'grok-4.1', // $5.50/$16.50 - enhanced
    deepseek: 'deepseek-v3',
    qwen: 'qwen3-max',
    mistral: 'devstral-small',
    moonshot: 'kimi-k2-thinking',
  },

  // Enterprise: Premium defaults with all access
  enterprise: {
    openai: 'gpt-5.2-pro', // $10/$30 - most capable
    anthropic: 'claude-opus-4-5', // $5/$25 - deep reasoning
    google: 'gemini-3-deep-think', // Advanced reasoning
    ollama: 'llama4-maverick',
    xai: 'grok-4.1', // Latest Grok
    deepseek: 'deepseek-v3',
    qwen: 'qwen3-max',
    mistral: 'devstral-small',
    moonshot: 'kimi-k2-thinking',
  },
};

/**
 * Model tier descriptions for UI display
 */
export const MODEL_TIER_INFO = {
  speed: {
    name: 'Speed Models',
    description: 'Ultra-fast responses for quick tasks',
    models: [
      'gpt-5-nano',
      'gemini-2-flash',
      'deepseek-v3',
      'devstral-small',
      'grok-3-mini',
      'claude-haiku-4-5',
    ],
  },
  balanced: {
    name: 'Balanced Models',
    description: 'Best balance of speed and quality',
    models: [
      'gpt-5-nano',
      'claude-sonnet-4-5',
      'gemini-3-pro',
      'grok-4.1-fast',
      'qwen3-max',
      'kimi-k2-thinking',
    ],
  },
  reasoning: {
    name: 'Reasoning Models',
    description: 'Deep thinking for complex analysis',
    models: ['claude-opus-4-5', 'gpt-5.1-thinking', 'gpt-5.2-pro', 'gemini-3-deep-think'],
  },
};

/**
 * Check if a model is available for a given plan
 */
export function canUseModel(planTier: PlanTier, modelId: string): boolean {
  const availableModels = PLAN_MODEL_RESTRICTIONS[planTier] || [];
  return availableModels.includes(modelId);
}

/**
 * Get default model for a provider and plan
 */
export function getDefaultModelForPlan(planTier: PlanTier, provider: string): string {
  const defaults = PLAN_DEFAULT_MODELS[planTier];
  return (defaults[provider] as string) || '';
}

/**
 * Filter available models for a plan
 */
export function getAvailableModelsForPlan(
  planTier: PlanTier,
  allModels: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const availableModelIds = PLAN_MODEL_RESTRICTIONS[planTier] || [];
  return allModels.filter((model) => availableModelIds.includes(model.value));
}

/**
 * Get tier name for a model
 */
export function getModelTier(modelId: string): 'speed' | 'balanced' | 'reasoning' | 'unknown' {
  if (MODEL_TIER_INFO.speed.models.includes(modelId)) return 'speed';
  if (MODEL_TIER_INFO.balanced.models.includes(modelId)) return 'balanced';
  if (MODEL_TIER_INFO.reasoning.models.includes(modelId)) return 'reasoning';
  return 'unknown';
}
