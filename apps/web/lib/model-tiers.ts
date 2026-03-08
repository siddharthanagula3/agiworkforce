import 'server-only';

/**
 * Shared model tier definitions for LLM access control.
 *
 * This is the single source of truth for model tier requirements.
 * Both /api/llm/completion and /api/llm/v1/chat/completions import from here.
 *
 * Tier hierarchy (ascending):
 *   free → hobby → pro → max → enterprise
 *
 * - free:       No cloud model access
 * - hobby:      Economy models only (< $1/1M output tokens)
 * - pro:        Economy + Pro-tier models ($1–15/1M)
 * - max/enterprise: All models including flagships
 */

/** Minimum tier(s) required to access a given model. */
export const MODEL_TIER_REQUIREMENTS: Record<string, ('pro' | 'max' | 'enterprise')[]> = {
  // =========================================================================
  // MAX / ENTERPRISE ONLY — Flagship models (expensive, highest quality)
  // =========================================================================
  'claude-opus-4.6': ['max', 'enterprise'],
  'claude-opus-4-6-20251101': ['max', 'enterprise'],
  'claude-opus-4.5': ['max', 'enterprise'],
  'claude-opus-4-5-20251101': ['max', 'enterprise'],
  'gpt-5-pro': ['max', 'enterprise'],
  'gemini-3-ultra': ['max', 'enterprise'],
  o3: ['max', 'enterprise'],
  'o3-pro': ['max', 'enterprise'],
  'grok-4': ['max', 'enterprise'],
  'deepseek-r1': ['max', 'enterprise'],

  // =========================================================================
  // PRO AND ABOVE — Mid-tier quality / cost balance
  // =========================================================================
  'gpt-5.2': ['pro', 'max', 'enterprise'],
  'gpt-5.2-pro': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4.6': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-6-20251029': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4.5': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-5-20250929': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-20250514': ['pro', 'max', 'enterprise'],
  'gemini-3-pro-preview': ['pro', 'max', 'enterprise'],
  'kimi-k2.5': ['pro', 'max', 'enterprise'],
  'kimi-k2.5-turbo': ['pro', 'max', 'enterprise'],
  'qwen-max': ['pro', 'max', 'enterprise'],
  'qwen-coder-plus': ['pro', 'max', 'enterprise'],
  'sonar-pro': ['pro', 'max', 'enterprise'],
  'sonar-reasoning': ['pro', 'max', 'enterprise'],
  'sonar-deep-research': ['pro', 'max', 'enterprise'],
};

/**
 * Economy-tier models — available to all paid subscribers (hobby+).
 * These are budget-friendly models under $1/1M output tokens.
 */
export const ECONOMY_MODELS = new Set<string>([
  // Google
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  // Anthropic
  'claude-haiku-4.5',
  'claude-haiku-4-5-20251001',
  'claude-3-haiku',
  // OpenAI
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-4o-mini',
  // xAI / Grok
  'grok-4-fast-reasoning',
  'grok-4-fast-non-reasoning',
  'grok-4-mini',
  'grok-code-fast-1',
  // Qwen / Alibaba
  'qwen-coder-flash',
  'qwen-turbo',
  'qwen-flash',
  'qwen-plus',
  // Perplexity
  'sonar',
  // DeepSeek
  'deepseek-chat',
  // Moonshot / Kimi
  'kimi-k2.5-thinking',
  // Zhipu / GLM
  'glm-4.7',
  'glm-4.6v',
  'glm-4.6v-flash',
]);

/**
 * Check whether a given subscription tier permits access to a model.
 *
 * @param model           - The model identifier (case-insensitive)
 * @param subscriptionTier - The user's plan tier (e.g. 'free', 'hobby', 'pro', 'max', 'enterprise')
 * @returns true if the user's tier grants access, false otherwise
 */
export function canAccessModel(model: string, subscriptionTier: string): boolean {
  const modelLower = model.toLowerCase();
  const tierLower = subscriptionTier.toLowerCase();

  // Free tier: no cloud model access through the API
  if (tierLower === 'free') {
    return false;
  }

  // Auto-model placeholders are always allowed — they resolve to real models later
  if (modelLower.startsWith('auto-')) {
    return true;
  }

  // Model has explicit tier requirements — verify the user meets them
  const requiredTiers = MODEL_TIER_REQUIREMENTS[modelLower];
  if (requiredTiers) {
    return requiredTiers.includes(tierLower as 'pro' | 'max' | 'enterprise');
  }

  // Model is in the economy set — available to all paid tiers (hobby+)
  if (ECONOMY_MODELS.has(modelLower)) {
    return true;
  }

  // Unknown model — deny by default for safety.
  // Log is intentionally omitted here; callers should log with more context.
  return false;
}
