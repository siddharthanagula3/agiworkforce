import type { OnDeviceModel } from '@agiworkforce/types';
import type { DeviceCapabilities } from './types';

const ET_URL_PREFIX = 'https://huggingface.co/software-mansion/react-native-executorch';
const ET_VERSION_TAG = 'resolve/v0.8.0';

const QWEN3_VL_2B_GGUF_URL =
  'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf';
const QWEN3_VL_2B_GGUF_SHA256 = '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae';
const QWEN3_VL_2B_GGUF_BYTES = 1_107_409_952;
const QWEN3_VL_2B_MMPROJ_URL =
  'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf';
const QWEN3_VL_2B_MMPROJ_SHA256 =
  'f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82';
const QWEN3_VL_2B_MMPROJ_BYTES = 445_053_216;

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
    license: 'Unverified',
    role: 'premium-vision-pack',
    shipsInV1: false,
  },
  {
    id: 'qwen3-vl-2b-instruct',
    displayName: 'AGI Vision Pack',
    family: 'qwen3-vl',
    paramCountB: 2.0,
    fileSizeBytes: QWEN3_VL_2B_GGUF_BYTES, // 1.11 GB Q4_K_M (verified)
    supportedRuntimes: ['llama-rn'],
    contextWindow: 262_144, // max_position_embeddings from the base model config (verified)
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Apache-2.0',
    role: 'premium-vision-pack',
    shipsInV1: false,
    downloadUrl: QWEN3_VL_2B_GGUF_URL,
    checksum: QWEN3_VL_2B_GGUF_SHA256,
    format: 'gguf',
    mmprojUrl: QWEN3_VL_2B_MMPROJ_URL,
    mmprojChecksum: QWEN3_VL_2B_MMPROJ_SHA256,
    mmprojSizeBytes: QWEN3_VL_2B_MMPROJ_BYTES,
  },
  {
    id: 'lfm2-vl-450m',
    displayName: 'AGI Vision Lite',
    family: 'lfm2-vl',
    paramCountB: 0.45,
    fileSizeBytes: 648_917_376, // verified quantized .pte (executorch host)
    supportedRuntimes: ['executorch'],
    contextWindow: 32_768,
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'LFM Open License v1.0 (free commercial use capped at $10M annual revenue)',
    role: 'premium-vision-pack',
    shipsInV1: false,
    downloadUrl: `${ET_URL_PREFIX}-lfm-2.5/${ET_VERSION_TAG}/lfm2.5-VL-450M/lfm2_5_vl_450m_8da4w_xnnpack.pte`,
    checksum: 'c3aeead4499cb1c19de48d4216f3b2e9216b27770d768ea4650dbcaa1a998a9b',
    format: 'pte',
    executorchPreset: {
      modelName: 'lfm2.5-vl-450m-quantized',
      modelSource: `${ET_URL_PREFIX}-lfm-2.5/${ET_VERSION_TAG}/lfm2.5-VL-450M/lfm2_5_vl_450m_8da4w_xnnpack.pte`,
      tokenizerSource: `${ET_URL_PREFIX}-lfm-2.5/${ET_VERSION_TAG}/lfm2.5-VL-450M/tokenizer.json`,
      tokenizerConfigSource: `${ET_URL_PREFIX}-lfm-2.5/${ET_VERSION_TAG}/lfm2.5-VL-450M/tokenizer_config.json`,
      capabilities: ['vision'],
      generationConfig: { temperature: 0.1, minP: 0.15, repetitionPenalty: 1.05 },
    },
  },
  {
    id: 'gemma4-e4b-instruct',
    displayName: 'AGI Premium Multimodal',
    family: 'gemma4',
    paramCountB: 4.5, // 4.5B effective / 8B with embeddings
    fileSizeBytes: 4_294_967_296, // ~4 GB Q4 — premium devices only; busts 2.5 GB universal budget
    supportedRuntimes: ['litert-lm'],
    contextWindow: 128_000,
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: true,
      structuredOutput: true,
    },
    license: 'Unverified',
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
    id: 'apple-system-language-model',
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
    displayName: 'Google on-device AI (Gemma-based)',
    family: 'google-system-model',
    paramCountB: 0,
    fileSizeBytes: 0, // OS-resident via AICore — not downloaded
    supportedRuntimes: ['aicore'],
    contextWindow: 4_000, // ML Kit Prompt API input guidance; device runtime owns the model
    capabilities: {
      text: true,
      visionIn: true,
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Google system service',
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

export function getLocalModelCatalog(): readonly OnDeviceModel[] {
  return CATALOG;
}

const LOCAL_MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  'apple-foundation-models': 'apple-system-language-model',
};

export function getModelById(id: string): OnDeviceModel | undefined {
  const canonicalId = LOCAL_MODEL_ID_ALIASES[id] ?? id;
  return CATALOG.find((m) => m.id === canonicalId);
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

const TIER_ONE_CATALOG_RUNTIME = {
  foundation_models: 'apple-foundation-models',
  aicore: 'aicore',
} as const;

export function getSystemModelForTier1Runtime(
  runtime: DeviceCapabilities['tier1Runtime'],
): OnDeviceModel | undefined {
  if (!runtime) return undefined;

  const catalogRuntime = TIER_ONE_CATALOG_RUNTIME[runtime];
  return CATALOG.find(
    (model) =>
      model.shipsInV1 &&
      model.role === 'system-multimodal' &&
      model.fileSizeBytes <= 0 &&
      model.supportedRuntimes.includes(catalogRuntime),
  );
}
