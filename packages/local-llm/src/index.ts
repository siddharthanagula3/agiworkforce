// @agiworkforce/local-llm — runtime tier selector and local inference API.
// PRD-MOBILE §8 §9. Tier 1 = Apple Foundation Models / Gemini Nano AICore.
// Tier 2 = react-native-executorch. Tier 3 = llama.rn (universal fallback).

export { localGenerate, selectTier, getCapabilities, refreshCapabilities } from './selector.js';
export { detectCapabilities, isThermallyThrottled } from './capabilities.js';
export { tier1Generate } from './tier1.js';
export { tier2LoadModel, tier2Generate } from './tier2.js';
export { tier3LoadModel, tier3Generate, tier3Release } from './tier3.js';
export {
  getModelById,
  getModelsForRole,
  getShippableModels,
  getDefaultModel,
  getLiteModeModel,
} from './catalog.js';
export type {
  LocalRuntimeName,
  LocalRuntimeTier,
  DeviceCapabilities,
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  LocalModel,
  LocalModelId,
} from './types.js';
