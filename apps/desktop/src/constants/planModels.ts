import type { PlanTier } from '../lib/supabase';

/**
 * Model availability by plan tier based on token costs and credit allocation
 *
 * Pricing Reference (per M tokens):
 *
 * HOBBY ($10/month = ~$1 token credit):
 * - Gemini-3-Flash: $0.10/$0.40 input/output (ULTRA CHEAP)
 * - Claude Haiku: $1.00/$5.00 (CHEAP)
 * - Llama 4: $0/$0 (FREE LOCAL)
 *
 * PRO ($30/month = $20 token credit):
 * - Gemini-3-Pro: $1.50/$6.00
 * - Claude Sonnet: $3.00/$15.00
 * - Qwen3-Max: $2.50/$10.00
 * - Kimi K2-Thinking: $1.50/$6.00
 * - GPT-5.1-Chat: $4.00/$12.00
 * - GPT-5.2-Chat: $4.00/$12.00
 * - Grok-4.1-Fast: $4.00/$12.00
 * - Grok-4.1: $5.50/$16.50
 *
 * MAX ($300/month = $250 token credit):
 * - ALL Pro models
 * - GPT-5.1: $5.50/$16.50
 * - GPT-5.2: $6.00/$18.00
 * - GPT-5.2-Codex: $8.00/$24.00
 * - GPT-5.1-Codex-Max: $8.00/$24.00
 * - GPT-5.1-Thinking: $7.00/$21.00
 * - Gemini-3-Deep-Think: $3.00/$12.00
 *
 * ENTERPRISE: ALL models including:
 * - Claude Opus: $15.00/$75.00 (EXTREMELY EXPENSIVE)
 * - GPT-5.2-Pro: $10.00/$30.00 (VERY EXPENSIVE)
 */
export const PLAN_MODEL_RESTRICTIONS: Record<PlanTier, string[]> = {
  // Free: No paid model access - only local models
  free: ['llama4-maverick'],

  // Hobby: ULTRA CHEAP models only ($1 credit max)
  hobby: [
    // Ultra cheap models
    'gemini-3-flash', // $0.1/$0.4 - essentially free
    'claude-haiku-4-5', // $1/$5 - best budget option
    'llama4-maverick', // $0/$0 - free local
  ],

  // Pro: Mid-range models ($20 token credit)
  // All Hobby models PLUS mid-cost models
  pro: [
    // Hobby tier
    'gemini-3-flash',
    'claude-haiku-4-5',
    'llama4-maverick',
    // Pro-tier additions (cost-effective)
    'gemini-3-pro', // $1.50/$6
    'kimi-k2-thinking', // $1.50/$6 - reasoning model
    'qwen3-max', // $2.50/$10 - reasoning model
    'claude-sonnet-4-5', // $3/$15 - good balance
    'gpt-5.1-chat-latest', // $4/$12 - fast chat
    'gpt-5.2-chat-latest', // $4/$12 - improved fast chat
    'grok-4.1-fast', // $4/$12 - 2M context
    'grok-4.1', // $5.50/$16.50 - enhanced reasoning
  ],

  // Max: ALL models ($250 token credit)
  // All Pro models PLUS ALL expensive flagship and ultra-premium models
  max: [
    // All Pro models included
    'gemini-3-flash',
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
    // Max-tier additions (expensive flagship)
    'gpt-5.1', // $5.50/$16.50
    'gpt-5.2', // $6/$18 - flagship
    'gpt-5.2-codex', // $8/$24 - code focused
    'gpt-5.1-codex-max', // $8/$24 - extended context
    'gpt-5.1-thinking', // $7/$21 - reasoning
    'gemini-3-deep-think', // $3/$12 - reasoning
    // Max-tier ultra-premium (most expensive)
    'claude-opus-4-5', // $15/$75 - EXTREMELY EXPENSIVE but included in Max
    'gpt-5.2-pro', // $10/$30 - VERY EXPENSIVE but included in Max
  ],

  // Enterprise: Everything including ultra-premium models
  enterprise: [
    // All Max models
    'gemini-3-flash',
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
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-thinking',
    'gemini-3-deep-think',
    // Enterprise-only (ultra-expensive)
    'claude-opus-4-5', // $15/$75 - EXTREMELY EXPENSIVE
    'gpt-5.2-pro', // $10/$30 - VERY EXPENSIVE
  ],
};

/**
 * Default models per plan tier
 * Users on these plans will have these models as their defaults
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

  // Hobby: Ultra-cheap models ONLY
  // Budget: $10/month = ~$1 token credit
  hobby: {
    openai: '', // GPT models too expensive
    anthropic: 'claude-haiku-4-5', // $1/$5 - most cost efficient
    google: 'gemini-3-flash', // $0.1/$0.4 - essentially free
    ollama: 'llama4-maverick', // Free local
    xai: '', // Grok models too expensive ($4+)
    deepseek: '',
    qwen: '',
    mistral: '',
    moonshot: '',
  },

  // Pro: Mid-range models
  // Budget: $30/month = $20 token credit
  pro: {
    openai: 'gpt-5.2-chat-latest', // $4/$12 - affordable fast chat
    anthropic: 'claude-sonnet-4-5', // $3/$15 - best balance
    google: 'gemini-3-pro', // $1.50/$6 - good reasoning
    ollama: 'llama4-maverick',
    xai: 'grok-4.1-fast', // $4/$12 - good for 2M context
    deepseek: '',
    qwen: 'qwen3-max', // $2.50/$10 - reasoning
    mistral: '',
    moonshot: 'kimi-k2-thinking', // $1.50/$6 - reasoning
  },

  // Max: ALL models including ultra-premium
  // Budget: $300/month = $250 token credit
  max: {
    openai: 'gpt-5.2-pro', // $10/$30 - most expensive GPT, now available
    anthropic: 'claude-opus-4-5', // $15/$75 - most capable, now available
    google: 'gemini-3-deep-think', // $3/$12 - advanced reasoning
    ollama: 'llama4-maverick',
    xai: 'grok-4.1', // $5.50/$16.50 - enhanced
    deepseek: '',
    qwen: 'qwen3-max', // $2.50/$10
    mistral: '',
    moonshot: 'kimi-k2-thinking',
  },

  // Enterprise: Everything available (no restrictions)
  enterprise: {
    openai: 'gpt-5.2-pro', // $10/$30 - most expensive GPT
    anthropic: 'claude-opus-4-5', // $15/$75 - most expensive Claude
    google: 'gemini-3-deep-think', // Advanced reasoning
    ollama: 'llama4-maverick',
    xai: 'grok-4.1', // Latest Grok
    deepseek: '',
    qwen: 'qwen3-max',
    mistral: '',
    moonshot: 'kimi-k2-thinking',
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
