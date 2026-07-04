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

// Cloudflare R2 public base URL for downloadable on-device model files (Wave 1-2
// task #22 — bucket/token provisioning tracked separately). Must use the
// EXPO_PUBLIC_ prefix so Metro/Expo inlines it into the client bundle; unset in
// dev until the bucket exists, in which case downloadUrl below resolves to
// undefined and the install flow reports the model as unavailable rather than
// throwing.
const R2_MODELS_BASE_URL = process.env.EXPO_PUBLIC_R2_MODELS_BASE_URL?.trim().replace(/\/$/, '');

function r2ModelUrl(fileName: string): string | undefined {
  return R2_MODELS_BASE_URL ? `${R2_MODELS_BASE_URL}/${fileName}` : undefined;
}

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
    role: 'system-model',
    shipsInV1: true,
  },
  {
    // Reclassified from the fictitious OS-resident "Gemini Nano via AICore" path
    // (com.google.mlkit:genai-common has no generic chat API — see
    // native/android/AGIAICoreModule.kt) to a real, downloadable model run through
    // com.google.mediapipe:tasks-genai's LlmInference API. Google's own gallery app
    // (google-ai-edge/gallery, model_allowlists/*.json) ships this exact checkpoint
    // for its lightest Android tier, via the newer LiteRT-LM runtime (.litertlm,
    // verified sizeInBytes 584_417_280). We target tasks-genai instead (per Wave
    // 1-2 task #25 decision), which consumes the equivalent .task bundle from the
    // same litert-community/Gemma3-1B-IT HF repo — see the official MediaPipe
    // sample (mediapipe-samples/examples/llm_inference/android, Model.kt). That
    // repo is Gemma-license-gated, so the exact byte size of the .task file itself
    // could not be verified without HF credentials; fileSizeBytes below reuses the
    // verified size of the equivalent int4 .litertlm sibling as the closest known
    // reference and MUST be corrected to the real .task size once it is fetched
    // for the R2 upload (deployment step, task #22).
    id: 'gemini-nano-aicore',
    displayName: 'Gemma 3 1B (Fast)',
    family: 'gemma3-1b',
    paramCountB: 1.0,
    fileSizeBytes: 584_417_280, // int4 — see comment above; unverified for the exact .task container
    supportedRuntimes: ['aicore'],
    contextWindow: 2_048, // matches the _ekv2048 prefill-cache variant we ship
    capabilities: {
      text: true,
      visionIn: false, // Gemma 3 1B is text-only (multimodal starts at 4B)
      audioIn: false,
      toolCalls: false,
      structuredOutput: false,
    },
    license: 'Gemma',
    role: 'system-model',
    shipsInV1: true,
    downloadUrl: r2ModelUrl('gemma3-1b-it-int4.task'),
    format: 'task',
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
