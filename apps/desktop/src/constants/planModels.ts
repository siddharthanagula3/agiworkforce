import type { PlanTier } from '../lib/supabase';

/**
 * Model Tier Strategy - December 2025
 * Models organized by plan tier and ranked by performance/value
 *
 * SPEED TIER (Hobby $10/month = $1.00 credit):
 * Ranked by value (performance per dollar):
 * 1. Gemini 3 Flash: $0.375/1M, 1240 Elo (3,307 Elo/$) - Best value 🏆
 * 2. GPT-5 Nano: $0.45/1M, 1200 Elo (2,667 Elo/$)
 * 3. DeepSeek V3.2: $0.67-$1.37/1M, 1270 Elo (927-1,896 Elo/$)
 * 4. Devstral Small 2: $0.40/1M, ~1210 Elo (3,025 Elo/$)
 * 5. Gemini 2.0 Flash: $0.50/1M, ~1220 Elo
 * 6. Grok 3 Mini: $0.80/1M, ~1180 Elo
 * 7. Claude Haiku 4.5: $6.00/1M, 1250 Elo (208 Elo/$)
 * 8. Local Models (Ollama): $0.00/1M, auto-detected, unlimited
 *
 * BALANCED TIER (Pro $29.99/month = $12 credit):
 * Ranked by quality/value:
 * 1. Gemini 3 Pro: $6.25-$7.50/1M, 1500 Elo (200-240 Elo/$) - Best chat 🏆
 * 2. Claude Sonnet 4.5: $18.00/1M, 1300 Elo, 77.2% SWE-bench - Best coding 🏆
 * 3. GPT-5.2: $12.50/1M, 1310 Elo (105 Elo/$) - Fast inference
 * 4. Gemini 3 Deep Think: $10.00/1M, 1295 Elo
 * 5. GPT-5.2 Chat: $16.00/1M, ~1300 Elo
 * 6. Qwen3-Max: $2.50/1M, ~1265 Elo
 * 7. Kimi K2 Thinking: $1.50/1M, reasoning
 * 8. Grok 4.1 Fast: $0.50/1M, 2M context
 * Plus all Speed tier models
 *
 * REASONING TIER (Max $299.99/month = $150 credit):
 * Ranked by performance:
 * 1. GPT-5.2 Pro: $20.00/1M, 1325 Elo - Best all-around 🏆
 * 2. Claude Opus 4.5: $30.00/1M, 1320 Elo - Deep reasoning
 * 3. GPT-5.2 Codex: $32.00/1M, 89% Pass@1, 97% HumanEval - Best coding 🏆
 * 4. GPT-5.1 Thinking: $28.00/1M, 1305 Elo - Thinking mode
 * 5. GPT-5.2: $12.50/1M, 1310 Elo, 187 tok/s - Fastest premium
 * 6. GPT-5.1: $22.00/1M, 1290 Elo
 * 7. Gemini 3 Deep Think: $10.00/1M, 1295 Elo
 * 8. GPT-5.1 Codex Max: $32.00/1M, extended context
 * Plus all Balanced tier models
 */
export const PLAN_MODEL_RESTRICTIONS: Record<PlanTier, string[]> = {
  // Free: No paid model access - only local models
  free: ['llama4-maverick'],

  // SPEED TIER: Ultra-fast, ultra-cheap models
  // Budget: $10/month = $1.00 credit
  // Ranked by value (performance per dollar)
  hobby: [
    // Rank 1: Best value (3,307 Elo/$)
    'gemini-3-flash', // $0.375/1M, 1240 Elo - Best value 🏆
    // Rank 2: Fast OpenAI option
    'gpt-5-nano', // $0.45/1M, 1200 Elo (2,667 Elo/$)
    // Rank 3: Best coding value
    'deepseek-v3', // $0.28/1M, 73.1% SWE-bench (best cost efficiency)
    // Rank 4: Latest Grok reasoning (cheaper than Grok 3 Mini, same price as non-reasoning)
    'grok-4.1-fast-reasoning', // $0.50/1M, ~1230 Elo, 2M context, reasoning, tool-calling (prioritized)
    'grok-4.1-fast', // $0.50/1M, ~1230 Elo, 2M context, tool-calling (non-reasoning)
    // Rank 5: General purpose (legacy)
    'grok-3-mini', // $0.80/1M, ~1180 Elo
    // Rank 6: Best quality/price ratio
    'claude-haiku-4-5', // $6.00/1M, 1250 Elo (208 Elo/$)
    // Rank 7: Free local (auto-detected)
    'llama4-maverick', // $0.00/1M, auto-detected Ollama models
  ],

  // BALANCED TIER: Good balance of speed and quality
  // Budget: $29.99/month = $12 credit
  // Ranked by quality/value
  pro: [
    // All Speed tier models (best value first)
    'gemini-3-flash', // Best value
    'gpt-5-nano',
    'deepseek-v3',
    'grok-3-mini',
    'claude-haiku-4-5',
    'llama4-maverick',
    // Balanced tier additions (ranked by performance)
    'gemini-3-pro', // $6.25-$7.50/1M, 1500 Elo - Best chat quality 🏆
    'claude-sonnet-4-5', // $18.00/1M, 1300 Elo, 77.2% SWE-bench - Best coding 🏆
    'gpt-5.2', // $12.50/1M, 1310 Elo, 187 tok/s - Fast inference
    'gemini-3-deep-think', // $10.00/1M, 1295 Elo - Advanced reasoning
    'gpt-5.2-chat-latest', // $16.00/1M, ~1300 Elo - Efficient chat
    'gpt-5.1-chat-latest', // $16.00/1M, ~1300 Elo - Fast chat
    'qwen3-max', // $2.50/1M, ~1265 Elo - Budget reasoning
    'kimi-k2-thinking', // $1.50/1M - Reasoning model
    'grok-4.1-fast-reasoning', // $0.50/1M - Fast, 2M context, reasoning (prioritized - same price as non-reasoning)
    'grok-4.1-fast', // $0.50/1M - Fast, 2M context (non-reasoning)
    'grok-4.1', // $22.00/1M - Enhanced reasoning
  ],

  // REASONING TIER: Deep thinking and complex analysis
  // Budget: $299.99/month = $150 credit
  // Ranked by performance
  max: [
    // All Balanced tier models (best value first)
    'gemini-3-flash',
    'gpt-5-nano',
    'deepseek-v3',
    'grok-3-mini',
    'claude-haiku-4-5',
    'llama4-maverick',
    'gemini-3-pro',
    'claude-sonnet-4-5',
    'gpt-5.2',
    'gemini-3-deep-think',
    'gpt-5.2-chat-latest',
    'gpt-5.1-chat-latest',
    'qwen3-max',
    'kimi-k2-thinking',
    'grok-4.1-fast',
    'grok-4.1',
    // Reasoning tier additions (ranked by performance)
    'gpt-5.2-pro', // $20.00/1M, 1325 Elo - Best all-around 🏆
    'claude-opus-4-5', // $30.00/1M, 1320 Elo - Deep reasoning
    'gpt-5.2-codex', // $32.00/1M, 89% Pass@1, 97% HumanEval - Best coding 🏆
    'gpt-5.1-thinking', // $28.00/1M, 1305 Elo - Thinking mode
    'gpt-5.1', // $22.00/1M, 1290 Elo - Flagship
    'gpt-5.1-codex-max', // $32.00/1M - Extended context coding
    'qwen3-max', // $2.50/1M - Budget reasoning
  ],

  // Enterprise: Everything including all premium models
  enterprise: [
    // All Reasoning tier models
    'gpt-5-nano',
    'gpt-5-nano',
    'gemini-3-flash',
    'deepseek-v3',
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
    qwen: '', // Coming Soon
    moonshot: '',
  },

  // SPEED TIER: Ultra-cheap defaults (ranked by value)
  hobby: {
    openai: 'gpt-5-nano', // $0.45/1M, 1200 Elo (2,667 Elo/$)
    anthropic: 'claude-haiku-4-5', // $6.00/1M, 1250 Elo (208 Elo/$)
    google: 'gemini-3-flash', // $0.375/1M, 1240 Elo (3,307 Elo/$) - Best value 🏆
    ollama: 'llama4-maverick', // Auto-detected local models
    xai: 'grok-4.1-fast-reasoning', // $0.50/1M, ~1230 Elo, 2M context, reasoning (prioritized - same price as non-reasoning)
    deepseek: 'deepseek-v3', // $0.67-$1.37/1M, 1270 Elo (best coding value)
    qwen: '',
    moonshot: '',
  },

  // BALANCED TIER: Good balance defaults (ranked by quality/value)
  pro: {
    openai: 'gpt-5.2', // $12.50/1M, 1310 Elo, 187 tok/s - Fast inference
    anthropic: 'claude-sonnet-4-5', // $18.00/1M, 1300 Elo, 77.2% SWE-bench - Best coding 🏆
    google: 'gemini-3-pro', // $6.25-$7.50/1M, 1500 Elo - Best chat quality 🏆
    ollama: 'llama4-maverick', // Auto-detected local models
    xai: 'grok-4.1-fast-reasoning', // $0.50/1M - Fast, 2M context, reasoning (prioritized - same price as non-reasoning)
    deepseek: 'deepseek-v3', // Still available for budget tasks
    qwen: 'qwen3-max', // $2.50/1M - Budget reasoning
    moonshot: 'kimi-k2-thinking', // $1.50/1M - Reasoning
  },

  // REASONING TIER: Premium defaults for deep thinking (ranked by performance)
  max: {
    openai: 'gpt-5.2-pro', // $20.00/1M, 1325 Elo - Best all-around 🏆
    anthropic: 'claude-opus-4-5', // $30.00/1M, 1320 Elo - Deep reasoning
    google: 'gemini-3-deep-think', // $10.00/1M, 1295 Elo - Advanced reasoning
    ollama: 'llama4-maverick', // Auto-detected local models
    xai: 'grok-4.1', // $22.00/1M - Enhanced reasoning
    deepseek: 'deepseek-v3', // Still available for budget tasks
    qwen: 'qwen3-max', // $2.50/1M - Budget reasoning
    moonshot: 'kimi-k2-thinking', // Reasoning
  },

  // Enterprise: Premium defaults with all access (best performance)
  enterprise: {
    openai: 'gpt-5.2-pro', // $20.00/1M, 1325 Elo - Most capable 🏆
    anthropic: 'claude-opus-4-5', // $30.00/1M, 1320 Elo - Deep reasoning
    google: 'gemini-3-deep-think', // $10.00/1M, 1295 Elo - Advanced reasoning
    ollama: 'llama4-maverick', // Auto-detected local models
    xai: 'grok-4.1', // $22.00/1M - Latest Grok
    deepseek: 'deepseek-v3', // Budget option available
    qwen: 'qwen3-max', // $2.50/1M - Budget reasoning
    moonshot: 'kimi-k2-thinking', // Reasoning
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
      'deepseek-v3',
      // 'devstral-small', // Coming Soon
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
