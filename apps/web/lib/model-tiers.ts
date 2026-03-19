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
 * - pro:        Latest mid-tier models ($5–20/1M output)
 * - max/enterprise: Latest flagship models (> $20/1M output or highest capability)
 *
 * Policy: only the latest generation per provider per tier.
 * Superseded models are removed when a newer generation ships.
 * Last updated: March 2026
 */

/** Minimum tier(s) required to access a given model. */
export const MODEL_TIER_REQUIREMENTS: Record<string, ('pro' | 'max' | 'enterprise')[]> = {
  // =========================================================================
  // MAX / ENTERPRISE ONLY — Latest flagship models
  // =========================================================================
  // Anthropic — Claude Opus 4.6 (Nov 2025, latest Opus)
  'claude-opus-4.6': ['max', 'enterprise'],
  'claude-opus-4-6-20251101': ['max', 'enterprise'],
  // OpenAI — GPT-5.4 / GPT-5.4 Pro (March 2026, flagship)
  'gpt-5.4': ['max', 'enterprise'],
  'gpt-5.4-pro': ['max', 'enterprise'],
  // OpenAI — o3 / o3-pro (latest reasoning flagships)
  o3: ['max', 'enterprise'],
  'o3-pro': ['max', 'enterprise'],
  // Google — Gemini 3.1 Pro (March 2026, latest Pro)
  'gemini-3.1-pro-preview': ['max', 'enterprise'],
  // xAI — Grok 4.20 (March 2026, latest stable flagship)
  'grok-4.20-multi-agent-beta-0309': ['max', 'enterprise'],
  'grok-4': ['max', 'enterprise'],
  // Mistral — Mistral Large 3 (Dec 2025, 675B params)
  'mistral-large-2512': ['max', 'enterprise'],
  // Perplexity — Sonar Reasoning Pro + Deep Research (most powerful)
  'sonar-reasoning-pro': ['max', 'enterprise'],
  'sonar-deep-research': ['max', 'enterprise'],

  // =========================================================================
  // PRO AND ABOVE — Latest mid-tier models ($5–20/1M output)
  // =========================================================================
  // OpenAI — GPT-5.4 Mini (March 2026, ~$4.50/1M output)
  'gpt-5.4-mini': ['pro', 'max', 'enterprise'],
  // OpenAI — o4-mini (latest reasoning mid-tier, ~$4–5/1M output)
  'o4-mini': ['pro', 'max', 'enterprise'],
  // Anthropic — Claude Sonnet 4.6 (Oct 2025, $15/1M output)
  'claude-sonnet-4.6': ['pro', 'max', 'enterprise'],
  'claude-sonnet-4-6-20251029': ['pro', 'max', 'enterprise'],
  // Mistral — Mistral Medium 3.1 (Aug 2025, API ID: mistral-medium-2508, $2.00/1M output)
  'mistral-medium-3': ['pro', 'max', 'enterprise'],
  'mistral-medium-2508': ['pro', 'max', 'enterprise'],
  // Qwen — Qwen 3.5 Plus (Feb 2026, $2.40/1M output)
  'qwen3.5-plus': ['pro', 'max', 'enterprise'],
  // DeepSeek — Reasoner / V3.2 thinking mode ($1.10/1M output)
  'deepseek-reasoner': ['pro', 'max', 'enterprise'],
  // Perplexity — Sonar Pro + Sonar Reasoning
  'sonar-pro': ['pro', 'max', 'enterprise'],
  'sonar-reasoning': ['pro', 'max', 'enterprise'],
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
  // Google — Gemini 3.1 Flash Lite (March 2026, $1.50/1M output, 1M context)
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',

  // Anthropic — Claude Haiku 4.5 (Oct 2025, $5.00/1M output, 200K context)
  'claude-haiku-4.5',
  'claude-haiku-4-5-20251001',

  // OpenAI — GPT-5.4 Nano (March 2026, $1.25/1M output, latest nano)
  'gpt-5.4-nano',

  // xAI — Grok 4.1 Fast (latest fast, $0.50/1M output, 2M context)
  'grok-4.1-fast-non-reasoning',

  // Qwen / Alibaba — Qwen 3.5 Flash (Feb 2026, $0.40/1M output, 1M context)
  'qwen3.5-flash',

  // DeepSeek — V3.2 chat (Dec 2025, $0.028/1M output, 128K context)
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
