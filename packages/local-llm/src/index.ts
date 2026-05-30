// @agiworkforce/local-llm — runtime tier selector and local inference API.
// PRD-MOBILE §8 §9. Tier 1 = Apple Foundation Models / Gemini Nano AICore.
// Tier 2 = react-native-executorch. Tier 3 = llama.rn (universal fallback).

export { localGenerate, selectTier, getCapabilities, refreshCapabilities } from './selector';
export { detectCapabilities, isThermallyThrottled } from './capabilities';
export { tier1Generate } from './tier1';
export { tier2LoadModel, tier2Generate, tier2Release, _setLLMModuleForTesting } from './tier2';
export { tier3LoadModel, tier3Generate, tier3Release } from './tier3';
export {
  getModelById,
  getModelsForRole,
  getShippableModels,
  getDefaultModel,
  getLiteModeModel,
} from './catalog';
export type {
  LocalRuntimeName,
  LocalRuntimeTier,
  DeviceCapabilities,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  LLMTool,
  LocalModel,
  LocalModelId,
} from './types';
