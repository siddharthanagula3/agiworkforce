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
 * - hobby:      Latest economy models (< $5/1M output, agentic, tool calling)
 * - pro:        Economy + Pro-tier models ($5–20/1M)
 * - max/enterprise: All models including flagships
 *
 * Policy: only the latest generation per provider is listed.
 * Superseded models are removed when a newer generation ships.
 * Last updated: March 2026
 */

/** Minimum tier(s) required to access a given model. */
export const MODEL_TIER_REQUIREMENTS: Record<string, ('pro' | 'max' | 'enterprise')[]> = {
  // =========================================================================
  // MAX / ENTERPRISE ONLY — Flagship models (latest generation only)
  // =========================================================================
  // Anthropic — Opus 4.6 (latest, Nov 2025)
  'claude-opus-4.6': ['max', 'enterprise'],
  'claude-opus-4-6-20251101': ['max', 'enterprise'],
  // OpenAI — GPT-5.4 Pro (latest flagship, March 2026, $180/1M output)
  'gpt-5.4-pro': ['max', 'enterprise'],
  // Google — Gemini Ultra (Vertex AI only)
  'gemini-3-ultra': ['max', 'enterprise'],
  // OpenAI — o3/o3-pro reasoning models
  o3: ['max', 'enterprise'],
  'o3-pro': ['max', 'enterprise'],
  // xAI — Grok 4 flagship
  'grok-4': ['max', 'enterprise'],
  // DeepSeek — R1 reasoning flagship
  'deepseek-r1': ['max', 'enterprise'],

  // =========================================================================
  // PRO AND ABOVE — Mid-tier quality / cost balance (latest generation only)
  // =========================================================================
  // OpenAI — GPT-5.4 (latest, March 2026, ~$15/1M output)
  'gpt-5.4': ['pro', 'max', 'enterprise'],
  // Anthropic — Claude Sonnet 4.6 (latest, Oct 2025, $15/1M output)
  'claude-sonnet-4.6': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-6-20251029': ['pro', 'max', 'enterprise'],
  // Google — Gemini 3.1 Pro Preview (latest, March 2026, ~$12–18/1M output)
  'gemini-3.1-pro-preview': ['pro', 'max', 'enterprise'],
  // Qwen — Qwen 3.5 Plus (latest mid-tier, Feb 2026, $2.40/1M output)
  'qwen3.5-plus': ['pro', 'max', 'enterprise'],
  // Perplexity — Sonar Pro / Reasoning / Deep Research
  'sonar-pro': ['pro', 'max', 'enterprise'],
  'sonar-reasoning': ['pro', 'max', 'enterprise'],
  'sonar-deep-research': ['pro', 'max', 'enterprise'],
};

/**
 * Economy-tier models — available to all paid subscribers (hobby+).
 *
 * Requirements (all must be met):
 *   1. Latest model generation from that provider
 *   2. Agentic capability (multi-step tool use, autonomous task execution)
 *   3. Output cost < $5 per 1M tokens
 */
export const ECONOMY_MODELS = new Set<string>([
  // Google — Gemini 3.1 Flash Lite (latest, March 2026, $1.50/1M output, 1M context)
  'gemini-3.1-flash-lite',

  // Anthropic — Claude Haiku 4.5 (latest Haiku, Oct 2025, $5.00/1M output, 200K context)
  'claude-haiku-4.5',
  'claude-haiku-4-5-20251001',

  // OpenAI — GPT-5.4 Mini (latest mini, March 2026, ~$1.20/1M output)
  'gpt-5.4-mini',

  // xAI — Grok 4.1 Fast (latest fast, $0.50/1M output, 2M context)
  'grok-4.1-fast-non-reasoning',

  // Qwen / Alibaba — Qwen 3.5 Flash (latest economy, Feb 2026, $0.40/1M output, 1M context)
  'qwen3.5-flash',

  // DeepSeek — V3.2 (latest, Dec 2025, $0.42/1M output, 128K context)
  'deepseek-chat',

  // Moonshot / Kimi — K2.5 series (latest, $3.00/1M output, 256K context)
  'kimi-k2.5',
  'kimi-k2.5-thinking',

  // Zhipu / GLM — GLM-4.7 (latest, $0.42/1M output)
  'glm-4.7',
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
