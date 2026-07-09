import type { OnDeviceModel } from '@agiworkforce/types';

// Executorch CDN prefix and version tag — these mirror the constants baked into
// react-native-executorch 0.8.4's modelUrls.ts. If the package is upgraded,
// verify these match the new VERSION_TAG so artifact URLs stay in sync.
const ET_URL_PREFIX = 'https://huggingface.co/software-mansion/react-native-executorch';
// Mirrors react-native-executorch 0.8.4 `constants/versions.ts`
// (`VERSION_TAG = 'resolve/v0.8.0'`). The `resolve/` segment is the HuggingFace
// raw-file ref path — without it the URL resolves to the repo's HTML file
// browser instead of the .pte bytes, so model download fails.
const ET_VERSION_TAG = 'resolve/v0.8.0';

// Qwen3-VL-2B-Instruct GGUF artifacts (official Qwen HuggingFace repo).
// Verified 2026-07-09 from huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF:
// the /raw/main LFS pointers and the /api/models/.../tree/main JSON both report
// the sha256 + byte sizes below (cross-checked, two independent endpoints).
// License on the repo is apache-2.0. The Q4_K_M weight file is the base GGUF;
// the mmproj file is the SEPARATE vision projector required by llama.rn
// `initMultimodal` — vision input is only effective once BOTH are installed.
const QWEN3_VL_2B_GGUF_URL =
  'https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf';
const QWEN3_VL_2B_GGUF_SHA256 =
  '089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae';
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
    // Keep hidden until exact checkpoint license and runnable artifacts are verified.
    license: 'Unverified',
    role: 'premium-vision-pack',
    shipsInV1: false,
  },
  {
    // P6 primary local multimodal SLM (monorepo-restructure §8). Apache-2.0,
    // official Qwen GGUF + mmproj vision projector, runs through the tier-3
    // llama.rn path via `initMultimodal` (requires `ctx_shift:false`).
    // `visionIn:true` here is the NOMINAL capability; the effective vision
    // capability is gated on the mmproj artifact being installed — see
    // `effectiveVisionIn` in ./multimodal.ts and the tier-3 runtime.
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
      // Conservative: text-with-image reasoning is the verified path. Tool calls
      // and structured output through the llama.rn multimodal GGUF route are not
      // device-verified, so they are not advertised as capabilities here.
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Apache-2.0',
    role: 'premium-vision-pack',
    // Artifacts are fully verified (URLs + sha256 + byte sizes, cross-checked),
    // BUT the mobile runtime path is not shippable yet: (1) there is no GGUF
    // download+verify+install path in apps/mobile (installStore only handles
    // ExecuTorch presets), (2) the model-picker filters out llama-rn-only rows
    // (`isSelectableLocalCatalogModel` requires an executorchPreset for
    // fileSizeBytes>0), and (3) on-device `initMultimodal` needs device QA.
    // The tier-3 multimodal code + pure download/verify/message-assembly logic
    // are implemented and unit-tested with a mocked native module, but the
    // end-to-end install+run flow is device-QA-gated. Flip to true only after
    // the mobile GGUF install path lands and on-device vision is verified.
    shipsInV1: false,
    downloadUrl: QWEN3_VL_2B_GGUF_URL,
    checksum: QWEN3_VL_2B_GGUF_SHA256,
    format: 'gguf',
    mmprojUrl: QWEN3_VL_2B_MMPROJ_URL,
    mmprojChecksum: QWEN3_VL_2B_MMPROJ_SHA256,
    mmprojSizeBytes: QWEN3_VL_2B_MMPROJ_BYTES,
  },
  {
    // P6 tier-2 low-RAM vision option (monorepo-restructure §8). GATED OFF.
    // Divergence surfaced for founder review: the plan named LFM2-VL-1.6B, but
    // the ONLY react-native-executorch-hosted preset that actually exists is the
    // newer 2.5 variant: `software-mansion/react-native-executorch-lfm2.5-VL-1.6B`
    // (verified 2026-07-09; quantized/lfm2_5_vl_450m_8da4w_xnnpack.pte,
    // 648,917,376 bytes, sha256 c3aeead4499cb1c19de48d4216f3b2e9216b27770d768ea4650dbcaa1a998a9b).
    // Held off shipping because: (a) it is the 2.5-VL variant, not the 2-VL the
    // decision named; (b) the exact `resolve/<tag>/` URL is unverified, so no
    // downloadUrl/executorchPreset is recorded here (no fabricated URLs); (c) the
    // tier-2 ExecuTorch wrapper does not yet pass image input; (d) LFM Open
    // License v1.0 permits free commercial use only up to $10M annual revenue and
    // must be re-reviewed at scale. fileSizeBytes is the verified quantized .pte.
    id: 'lfm2-vl-1.6b',
    displayName: 'AGI Vision Lite',
    family: 'lfm2-vl',
    paramCountB: 1.6,
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
