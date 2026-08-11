import type { OnDeviceModel } from '@agiworkforce/types';
import type { DeviceCapabilities } from './types';

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
    // Artifacts are fully verified (URLs + sha256 + byte sizes, cross-checked)
    // and the full software path is wired and tested with mocked native layers:
    // gguf+mmproj install (apps/mobile services/modelDownload + installStore),
    // picker selectability (`isSelectableLocalCatalogModel` accepts verified
    // llama-rn GGUF rows), tier-3 `initMultimodal` lifecycle, and vision
    // routing. The ONLY remaining ship gate is device QA: real on-device
    // `initMultimodal` execution, vision output quality, and the RAM/thermal
    // matrix (restructure §8 checklist). Flip to true after device QA passes.
    shipsInV1: false,
    downloadUrl: QWEN3_VL_2B_GGUF_URL,
    checksum: QWEN3_VL_2B_GGUF_SHA256,
    format: 'gguf',
    mmprojUrl: QWEN3_VL_2B_MMPROJ_URL,
    mmprojChecksum: QWEN3_VL_2B_MMPROJ_SHA256,
    mmprojSizeBytes: QWEN3_VL_2B_MMPROJ_BYTES,
  },
  {
    // P6 tier-2 low-RAM vision backup option (monorepo-restructure §8). GATED OFF.
    // CORRECTED 2026-07-15 (founder-confirmed naming fix, not a re-litigation of
    // the model choice): this row previously carried id `lfm2-vl-1.6b` /
    // paramCountB 1.6, but the size/checksum actually recorded and verified here
    // have always been the react-native-executorch-hosted LFM2.5-VL-**450M**
    // preset (`lfm2.5-vl-450m-quantized`), not the 1.6B one. The TRUE 1.6B
    // artifact does exist and was independently verified 2026-07-15 —
    // `lfm2.5-VL-1.6B/quantized/lfm2_5_vl_1_6b_8da4w_xnnpack.pte`,
    // 2,427,656,704 bytes, sha256
    // 5f942c856acfe1a4d0b5f8d30bd752b5552bcf20bc6dfa6f3253896b2456d0c4 — but at
    // 2.4GB it is LARGER than the 1.1GB Qwen3-VL-2B primary model, which
    // contradicts the "low-RAM tier-2 backup" product intent the founder's
    // decision was naming. This row is therefore kept as the 450M model (id,
    // paramCountB, and displayName corrected to match; size/checksum were
    // already correct) — do not "fix" the id back to 1.6b without re-verifying
    // which artifact the product intent actually wants.
    // Both artifacts confirmed via direct HF `curl -I` against
    // huggingface.co/software-mansion/react-native-executorch-lfm-2.5
    // (x-linked-size/x-linked-etag), independent of react-native-executorch's
    // own modelUrls.js (installed at ^0.8.4; also cross-checked).
    // CAPABILITY HONESTY (updated 2026-07-16): `visionIn` is now the NOMINAL
    // capability, mirroring the Qwen3-VL-2B tier-3 row — the tier-2 vision
    // plumbing SHIPS in this repo: tier2.ts forwards `capabilities:['vision']`
    // to `LLMModule.fromModelName`, applies the model card's generation config,
    // and passes the current turn's image as `mediaPath` on the user message
    // (react-native-executorch 0.8.4's documented multimodal path — the same
    // package export `LFM2_5_VL_450M_QUANTIZED` carries these exact values).
    // The EFFECTIVE capability stays install-gated: `effectiveTier2VisionIn`
    // in ./multimodal.ts is true only when this model is actually installed —
    // never from this catalog flag alone. Ship gate unchanged: shipsInV1 flips
    // only after on-device QA (real generateMultimodal execution + RAM/thermal
    // matrix), which no amount of mocked-native testing can substitute for.
    // executorchPreset URLs use the same mirrored ET_URL_PREFIX/ET_VERSION_TAG
    // pattern as the qwen3/llama presets above and were verified 2026-07-16
    // against BOTH the installed package's own modelUrls.js (0.8.4,
    // VERSION_TAG resolve/v0.8.0) and live HF (tokenizer resolves; .pte LFS
    // pointer sha256+size match `checksum`/`fileSizeBytes` below). The .pte is
    // a SINGLE artifact (vision projector embedded) — no mmproj pair; the
    // ExecuTorch module manages its own download, so `checksum` here is the
    // independently verified audit digest, not a wired verify step.
    // LFM Open License v1.0 permits free commercial use only up to $10M
    // annual revenue and must be re-reviewed at scale.
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
    // Keep the catalog identity distinct from the runtime protocol name. The
    // OS runtime may stay stable while Apple replaces the underlying model,
    // and consumers must select this row through capabilities rather than by
    // duplicating a runtime-shaped model ID.
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
    // The model generation and parameter count are device/OS managed. Google's
    // current Gemini Nano generation is based on Gemma, but older supported
    // devices must not be mislabeled as one downloadable checkpoint.
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

/**
 * Read-only canonical on-device catalog projection for policy checks and
 * catalog-derived consumers. Callers must not mutate the returned records.
 */
export function getLocalModelCatalog(): readonly OnDeviceModel[] {
  return CATALOG;
}

const LOCAL_MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  // Persisted selections from releases that reused the runtime discriminator
  // as the catalog model identity migrate through this owner-only alias.
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

/**
 * Resolve the OS-resident model owned by the local catalog for the active
 * Tier-1 runtime. Consumers must not duplicate the system model IDs: the
 * catalog is the only owner of those identities and runtime capabilities.
 */
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
