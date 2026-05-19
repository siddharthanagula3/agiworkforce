import type { OnDeviceModel } from '@agiworkforce/types';

// Executorch CDN prefix and version tag — these mirror the constants baked into
// react-native-executorch 0.8.4's modelUrls.ts. If the package is upgraded,
// verify these match the new VERSION_TAG so artifact URLs stay in sync.
const ET_URL_PREFIX = 'https://huggingface.co/software-mansion/react-native-executorch';
const ET_VERSION_TAG = 'v0.8.0';

// License note for Qwen2.5-VL-3B: research report claims Apache-2.0, but the
// memory lock (v1-model-selection-final-2026-05-18.md) flags it as potentially
// "Qwen License (not Apache 2.0)" — verify checkpoint before Wave 0 ship.
// Qwen3-VL-4B is the preferred family-aligned alternative if license is dirty.
const CATALOG: OnDeviceModel[] = [
  {
    id: 'qwen3-4b-instruct-2507',
    displayName: 'AGI Standard',
    family: 'qwen3',
    paramCountB: 4.0,
    fileSizeBytes: 2_147_483_648, // ~2 GB Q4
    supportedRuntimes: ['executorch', 'llama-rn'],
    contextWindow: 262_144,
    capabilities: {
      text: true,
      visionIn: false,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    license: 'Apache-2.0',
    role: 'default',
    shipsInV1: true,
    executorchPreset: {
      modelName: 'qwen3-4b-quantized',
      modelSource: `${ET_URL_PREFIX}-qwen-3/${ET_VERSION_TAG}/qwen-3-4B/quantized/qwen3_4b_8da4w.pte`,
      tokenizerSource: `${ET_URL_PREFIX}-qwen-3/${ET_VERSION_TAG}/tokenizer.json`,
      tokenizerConfigSource: `${ET_URL_PREFIX}-qwen-3/${ET_VERSION_TAG}/tokenizer_config.json`,
    },
  },
  {
    id: 'qwen2.5-vl-3b-instruct',
    displayName: 'AGI Vision Pack',
    family: 'qwen2.5-vl',
    paramCountB: 3.0,
    fileSizeBytes: 1_932_735_283, // ~1.8 GB Q4 estimate
    supportedRuntimes: ['executorch', 'llama-rn'],
    contextWindow: 32_768,
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    // WAVE 0 VERIFICATION REQUIRED: research report says Apache-2.0; memory lock
    // flags potential "Qwen License" restriction — confirm checkpoint license tag
    // before distributing. Fallback: replace with qwen3-vl-4b-instruct if dirty.
    license: 'Apache-2.0 (verify checkpoint — see Wave 0 action item)',
    role: 'premium-vision-pack',
    shipsInV1: true,
  },
  {
    id: 'gemma4-e4b-instruct',
    displayName: 'AGI Premium Multimodal',
    family: 'gemma4',
    paramCountB: 4.5, // 4.5B effective / 8B with embeddings
    fileSizeBytes: 4_294_967_296, // ~4 GB Q4 — premium devices only; busts 2.5 GB universal budget
    supportedRuntimes: ['executorch', 'llama-rn'],
    contextWindow: 128_000,
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    license: 'Apache-2.0', // shifted from Gemma terms in April 2026 release
    role: 'premium-multimodal-alt',
    shipsInV1: false,
  },
  {
    id: 'llama-3.2-1b-instruct-spinquant',
    displayName: 'AGI Lite',
    family: 'llama3.2',
    paramCountB: 1.0,
    fileSizeBytes: 1_181_116_006, // ~1.1 GB SpinQuant variant
    supportedRuntimes: ['executorch', 'llama-rn'],
    contextWindow: 131_072,
    capabilities: {
      text: true,
      visionIn: false,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Llama Community',
    role: 'lite-mode',
    shipsInV1: true,
    liteMode: true,
    executorchPreset: {
      modelName: 'llama-3.2-1b-spinquant',
      modelSource: `${ET_URL_PREFIX}-llama-3.2/${ET_VERSION_TAG}/llama-3.2-1B/spinquant/llama3_2_spinquant.pte`,
      tokenizerSource: `${ET_URL_PREFIX}-llama-3.2/${ET_VERSION_TAG}/tokenizer.json`,
      tokenizerConfigSource: `${ET_URL_PREFIX}-llama-3.2/${ET_VERSION_TAG}/tokenizer_config.json`,
    },
  },
  {
    id: 'apple-foundation-models',
    displayName: 'Apple Intelligence',
    family: 'apple-fm',
    paramCountB: 3.0, // ~3B system model
    fileSizeBytes: 0, // OS-resident — not downloaded
    supportedRuntimes: ['apple-foundation-models'],
    contextWindow: 4_096, // Apple FM public context cap (Wave 1-2 budgeting task #30)
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    license: 'Apple Entitlement',
    role: 'system-multimodal',
    shipsInV1: true,
  },
  {
    id: 'gemini-nano-aicore',
    displayName: 'Gemini Nano',
    family: 'gemini-nano',
    paramCountB: 1.8, // Nano v2 approximate
    fileSizeBytes: 0, // OS-resident via AICore — not downloaded
    supportedRuntimes: ['aicore'],
    contextWindow: 1_024, // AICore Prompt API limit on Nano
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Google AICore',
    role: 'system-multimodal',
    shipsInV1: true,
  },
  {
    id: 'phi-4-mini-instruct',
    displayName: 'Phi-4 Mini (Internal)',
    family: 'phi4-mini',
    paramCountB: 3.8,
    fileSizeBytes: 2_415_919_104, // ~2.25 GB Q4
    supportedRuntimes: ['executorch', 'llama-rn'],
    contextWindow: 16_384,
    capabilities: {
      text: true,
      visionIn: false,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    license: 'MIT',
    role: 'internal-eval-hedge',
    shipsInV1: false,
  },
];

export function getModelById(id: string): OnDeviceModel | undefined {
  return CATALOG.find((m) => m.id === id);
}

export function getModelsForRole(role: OnDeviceModel['role']): OnDeviceModel[] {
  return CATALOG.filter((m) => m.role === role);
}

export function getShippableModels(): OnDeviceModel[] {
  return CATALOG.filter((m) => m.shipsInV1);
}

export function getDefaultModel(): OnDeviceModel {
  const model = CATALOG.find((m) => m.role === 'default');
  if (!model) throw new Error('No default on-device model in catalog — catalog is corrupted');
  return model;
}

export function getLiteModeModel(): OnDeviceModel | undefined {
  return CATALOG.find((m) => m.liteMode === true);
}
