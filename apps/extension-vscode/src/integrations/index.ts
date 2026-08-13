/**
 * integrations/ — Provider-switch policy, patch apply engine, and subscription tier resolution.
 * providerSwitchGuard: Max paywall guard for cross-provider conversation switching.
 * patchEngine: LLM diff parser + fuzzy apply + batch undo for agent-mode edits.
 * tierResolver: subscription tier resolution (settings → bridge → cache → fallback).
 */
export { extractProvider, guardProviderSwitch } from './providerSwitchGuard';
export type { SwitchGuardResult } from './providerSwitchGuard';

export {
  getPatchOutputChannel,
  parsePatchBlocks,
  applyPatch,
  aggressiveFuzzyMatch,
  applyPatchAggressive,
  showOriginalContext,
} from './patchEngine';
export type { PatchConfidence, PatchBlock, PatchResult } from './patchEngine';

export { TIER_ORDER, tierAtLeast, resolveTier } from './tierResolver';
export type { Tier } from './tierResolver';
