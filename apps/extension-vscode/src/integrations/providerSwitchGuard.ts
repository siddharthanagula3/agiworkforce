/**
 * providerSwitchGuard.ts — Max-tier enforcement for cross-provider model switches.
 *
 * Cross-provider model selection is a Max-tier differentiator. When a user on a
 * tier below 'max' attempts to choose a model from another provider in the
 * visible conversation, this guard returns 'upgrade-required' and the caller
 * shows the upgrade prompt. An allowed provider-boundary change still starts a
 * fresh runtime session; this guard never authorizes transcript forwarding.
 *
 * (This previously gated on the unshipped 'pro_plus' tier, which was removed
 * with no direct successor — the gate now sits at the next tier that actually
 * exists above it, 'max', rather than silently loosening to 'pro'.)
 *
 * Mirrors unified-chat's plan eligibility while preserving the VS Code trust
 * boundary: provider changes remain visible, but runtime context does not cross
 * providers implicitly.
 *
 * Design notes:
 *   - Provider identity comes from the canonical model catalog, including its
 *     alias normalization. Unknown/future IDs stay unknown until the catalog
 *     admits them; this guard never guesses identity from a vendor-like prefix.
 *   - Auto-mode model IDs ('auto-*') are treated as provider-agnostic and never
 *     trigger the guard regardless of tier.
 *   - Switching within the same provider is always allowed (any tier).
 *   - Switching to/from an auto-mode model is always allowed (any tier).
 */

import { getModelMetadataById } from '@agiworkforce/types';
import type { Tier } from './tierResolver';
import { tierAtLeast } from './tierResolver';

// ─── Provider extraction ──────────────────────────────────────────────────────

/**
 * Derive a normalized provider token from a model ID.
 *
 * Rules (in order):
 *   1. Auto-mode IDs ('auto-balanced', 'auto-economy', 'auto-premium', 'auto-*')
 *      → special sentinel 'auto' (never triggers cross-provider gate).
 *   2. Catalog model/alias → canonical provider name.
 *   3. Unknown → 'unknown' (treated as same provider as anything else, so the
 *      guard does not fire on ambiguous IDs).
 *
 * Provider-looking unknown strings intentionally remain unknown. Adding or
 * replacing a provider model is a catalog operation, not a consumer edit.
 */
export function extractProvider(modelId: string): string {
  if (!modelId || modelId.trim() === '') return 'unknown';

  const id = modelId.trim();
  const normalizedId = id.toLowerCase();

  // Auto-mode — never cross-provider
  if (normalizedId.startsWith('auto-') || normalizedId === 'auto') return 'auto';

  return String(getModelMetadataById(normalizedId)?.provider ?? 'unknown');
}

// ─── Guard result ─────────────────────────────────────────────────────────────

export type SwitchGuardResult = 'allow' | 'upgrade-required';

// ─── Guard function ───────────────────────────────────────────────────────────

/**
 * Determine whether a provider switch is permitted for the given tier.
 *
 * Returns:
 *   - 'allow'            — switch is permitted (same provider, auto-mode, or max tier)
 *   - 'upgrade-required' — different providers, tier below max
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

  // Cross-provider switch: require max tier
  return tierAtLeast(tier, 'max') ? 'allow' : 'upgrade-required';
}
