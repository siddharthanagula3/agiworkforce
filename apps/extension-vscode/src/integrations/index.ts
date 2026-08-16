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
