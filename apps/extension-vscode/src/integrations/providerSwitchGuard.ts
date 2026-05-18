/**
 * providerSwitchGuard.ts — Pro+ tier enforcement for cross-provider model switches.
 *
 * Multi-provider in-thread switching is the Pro+ differentiator. When a user on
 * a tier below 'pro_plus' attempts to switch from one provider to a different one
 * mid-conversation, this guard returns 'upgrade-required' and the caller shows
 * the upgrade prompt.
 *
 * Mirrors the logic in unified-chat's selectProviderSwitchGate so that behaviour
 * is consistent across surfaces.
 *
 * Design notes:
 *   - "Provider" is derived from model ID prefix, not from the full model catalog,
 *     so this works even with unknown/future model IDs.
 *   - Auto-mode model IDs ('auto-*') are treated as provider-agnostic and never
 *     trigger the guard regardless of tier.
 *   - Switching within the same provider is always allowed (any tier).
 *   - Switching to/from an auto-mode model is always allowed (any tier).
 */

import type { Tier } from './tierResolver';
import { tierAtLeast } from './tierResolver';

// ─── Provider extraction ──────────────────────────────────────────────────────

/**
 * Derive a normalized provider token from a model ID.
 *
 * Rules (in order):
 *   1. Auto-mode IDs ('auto-balanced', 'auto-economy', 'auto-premium', 'auto-*')
 *      → special sentinel 'auto' (never triggers cross-provider gate).
 *   2. Known prefix patterns → canonical provider name.
 *   3. Unknown → 'unknown' (treated as same provider as anything else, so the
 *      guard does not fire on ambiguous IDs).
 *
 * This function intentionally does NOT import the full model catalog to keep
 * the guard lightweight and dependency-free.
 */
export function extractProvider(modelId: string): string {
  if (!modelId || modelId.trim() === '') return 'unknown';

  const id = modelId.toLowerCase().trim();

  // Auto-mode — never cross-provider
  if (id.startsWith('auto-') || id === 'auto') return 'auto';

  // Anthropic: claude-*
  if (id.startsWith('claude-')) return 'anthropic';

  // OpenAI: gpt-*, o1-*, o3-*, o4-*
  if (id.startsWith('gpt-') || /^o[1-9]-/.test(id)) return 'openai';

  // Google: gemini-*
  if (id.startsWith('gemini-')) return 'google';

  // xAI: grok-*
  if (id.startsWith('grok-')) return 'xai';

  // DeepSeek: deepseek-*
  if (id.startsWith('deepseek-')) return 'deepseek';

  // Perplexity: sonar-*, pplx-*
  if (id.startsWith('sonar-') || id.startsWith('pplx-')) return 'perplexity';

  // Qwen: qwen-*
  if (id.startsWith('qwen-')) return 'qwen';

  // Moonshot / Kimi: kimi-*, moonshot-*
  if (id.startsWith('kimi-') || id.startsWith('moonshot-')) return 'moonshot';

  // Zhipu: glm-*
  if (id.startsWith('glm-')) return 'zhipu';

  // Ollama local: typically bare names like 'llama3', 'mistral', 'phi3'
  // No reliable prefix pattern — leave as 'unknown'

  return 'unknown';
}

// ─── Guard result ─────────────────────────────────────────────────────────────

export type SwitchGuardResult = 'allow' | 'upgrade-required';

// ─── Guard function ───────────────────────────────────────────────────────────

/**
 * Determine whether a provider switch is permitted for the given tier.
 *
 * Returns:
 *   - 'allow'            — switch is permitted (same provider, auto-mode, or pro_plus+)
 *   - 'upgrade-required' — different providers, tier < pro_plus
 *
 * @param currentModelId - The currently active model ID (before the switch).
 * @param nextModelId    - The model ID the user is switching to.
 * @param tier           - The resolved subscription tier.
 */
export function guardProviderSwitch(
  currentModelId: string,
  nextModelId: string,
  tier: Tier,
): SwitchGuardResult {
  const currentProvider = extractProvider(currentModelId);
  const nextProvider = extractProvider(nextModelId);

  // Auto-mode switches are always allowed
  if (currentProvider === 'auto' || nextProvider === 'auto') return 'allow';

  // Same provider → always allow
  if (currentProvider === nextProvider) return 'allow';

  // Unknown provider on either side → allow (don't gate on ambiguous IDs)
  if (currentProvider === 'unknown' || nextProvider === 'unknown') return 'allow';

  // Cross-provider switch: require pro_plus or higher
  return tierAtLeast(tier, 'pro_plus') ? 'allow' : 'upgrade-required';
}
