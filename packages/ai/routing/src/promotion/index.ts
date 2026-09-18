/**
 * Staged release: internal, canary, stable, and the versioned rollback between
 * them, for the model registry, the routing policy and the product prompts.
 *
 * The ledger lives in `packages/ai/model-registry/catalog/routing-policies.json`
 * under `release`, and `release-cli.mjs` is the command that reads and writes
 * it. Nothing here calls a provider or touches the filesystem.
 */

export {
  channelForLifecycleStage,
  channelRank,
  channelTransitionRejection,
  channelVocabularyDrift,
  isReleaseChannel,
  lifecycleStagesForChannel,
  RELEASE_CHANNELS,
} from './channels';
export type { ReleaseChannel } from './channels';
export {
  applyRecord,
  currentRelease,
  effectiveSlotCandidates,
  planAdvance,
  planRollback,
  probeBindingProblems,
  QUALITY_VERDICTS,
  recordsFor,
  releaseKey,
  releaseLedgerProblems,
  RELEASE_ARTIFACT_KINDS,
  slotBindingProblems,
} from './release-ledger';
export type {
  AdvanceRequest,
  ProbeOutcome,
  QualitySignal,
  QualityVerdict,
  ReleaseArtifactKind,
  ReleaseLedger,
  ReleasePlan,
  ReleaseRecord,
  RollbackPlan,
  SlotCandidates,
  SlotCanary,
  SlotShadow,
} from './release-ledger';
export {
  ledgerPromptStamps,
  malformedPromptReleaseIds,
  parsePromptRelease,
  promptReleaseId,
} from './prompt-release';
export type { PromptRelease } from './prompt-release';
