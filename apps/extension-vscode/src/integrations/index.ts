/**
 * integrations/ — Cross-provider routing, patch apply engine, and subscription tier resolution.
 * providerStreamClient: provider-specific stream adapters (Anthropic, OpenAI, Ollama, Google).
 * providerSwitchGuard: Pro+ paywall guard for cross-provider conversation switching.
 * patchEngine: LLM diff parser + fuzzy apply + batch undo for agent-mode edits.
 * tierResolver: subscription tier resolution (settings → bridge → cache → fallback).
 */
export { streamFromProvider } from './providerStreamClient';
export type {
  ProviderStreamProvider,
  ProviderStreamMessage,
  ProviderStreamRequest,
  StreamChunk,
  StreamFromProviderParams,
} from './providerStreamClient';

export { extractProvider, guardProviderSwitch } from './providerSwitchGuard';
export type { SwitchGuardResult } from './providerSwitchGuard';

export {
  getPatchOutputChannel,
  parsePatchBlocks,
  applyPatch,
  aggressiveFuzzyMatch,
  applyPatchAggressive,
  applyPatchBatch,
  storeBatchForUndo,
  undoPatchBatch,
  showOriginalContext,
} from './patchEngine';
export type { PatchConfidence, PatchBlock, PatchResult, BatchResult } from './patchEngine';

export { TIER_ORDER, tierAtLeast, fetchTierFromBridge, resolveTier } from './tierResolver';
export type { Tier } from './tierResolver';
