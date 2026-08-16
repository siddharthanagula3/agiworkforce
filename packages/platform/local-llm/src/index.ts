
export { localGenerate, selectTier, getCapabilities, refreshCapabilities } from './selector';
export { detectCapabilities, isThermallyThrottled } from './capabilities';
export { tier1Generate } from './tier1';
export {
  tier2LoadModel,
  tier2Generate,
  tier2Release,
  tier2IsVisionReady,
  executorchVlmPresetInfo,
  _setLLMModuleForTesting,
} from './tier2';
export {
  tier3LoadModel,
  tier3LoadMultimodalModel,
  tier3Generate,
  tier3Release,
  tier3IsMultimodalReady,
  _setLlamaModuleForTesting,
} from './tier3';
export {
  resolveMultimodalArtifacts,
  isMultimodalModel,
  hasRunnableGgufArtifacts,
  effectiveVisionIn,
  effectiveTier2VisionIn,
  hasSufficientRAMForMultimodal,
  MULTIMODAL_MIN_RAM_MB,
  ensureVerifiedArtifact,
  ensureMultimodalArtifacts,
  buildMultimodalMessages,
  ChecksumMismatchError,
} from './multimodal';
export type {
  MultimodalArtifact,
  MultimodalArtifacts,
  MultimodalInstallResult,
  FileSystemDeps,
  LlamaMessage,
  LlamaContentPart,
} from './multimodal';
export {
  getLocalModelCatalog,
  getModelById,
  getModelsForRole,
  getShippableModels,
  getDefaultModel,
  getLiteModeModel,
  getSystemModelForTier1Runtime,
} from './catalog';
export type {
  LocalRuntimeName,
  LocalRuntimeTier,
  DeviceCapabilities,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  LLMTool,
} from './types';
