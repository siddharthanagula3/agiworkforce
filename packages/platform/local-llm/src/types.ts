// Runtime tier identifiers matching PRD-MOBILE §8 and DB schema.
export type LocalRuntimeName = 'foundation_models' | 'aicore' | 'executorch' | 'llama_rn';

export type LocalRuntimeTier = 1 | 2 | 3;

/**
 * Fine-grained Tier 1 system-model status, sourced from the native side's
 * feature-download state (Android AICore `FeatureStatus`; iOS is always
 * 'unavailable' while Foundation Models is stubbed). `tier1Available` stays a
 * plain boolean (true only for 'available') for existing callers; use
 * `tier1Status` when the caller needs to distinguish "not supported" from
 * "fetching in the background".
 */
export type Tier1Status = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface DeviceCapabilities {
  totalRAMMB: number;
  osVersion: string;
  thermalThrottled: boolean;
  tier1Available: boolean;
  tier1Runtime: 'foundation_models' | 'aicore' | null;
  tier1Status: Tier1Status;
  tier2Available: boolean;
  tier3Available: true;
}

/**
 * Minimal chat-message shape used as the input to local LLM templated prompts
 * (Foundation Models, AICore, ExecuTorch, Llama.rn). This is intentionally a
 * sibling — not a subtype — of the wire/storage `ChatMessage` in
 * `@agiworkforce/types`: this one carries only what the model's tokenizer
 * chat template needs (role + text content). Mapping from the platform
 * ChatMessage to this minimal form happens at the on-device-runtime entry.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Opaque tool descriptor passed to the model's chat template.
 * Shape depends on the model — Qwen3 uses the Qwen-Agent JSON schema.
 * Only has effect when the model's tokenizer_config.json includes a tool-call template.
 */
export type LLMTool = object;

export interface GenerateOptions {
  /**
   * Catalog model id for runtimes that cache by named preset instead of a
   * caller-visible file path. Keep passing `modelPath` as the first
   * `localGenerate` argument for llama.rn / GGUF models.
   */
  modelId?: string;
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];
  /**
   * Images attached to the CURRENT user turn, as `file://` URIs or `data:`
   * base64 URLs. Only effective on a multimodal runtime with a loaded mmproj
   * projector (tier-3 llama.rn `initMultimodal`); ignored by text-only runtimes.
   */
  images?: string[];
  /**
   * On-disk path to the mmproj vision-projector for a tier-3 multimodal GGUF
   * model. When present, tier-3 loads the model via `initLlama({ ctx_shift:false })`
   * + `initMultimodal({ path })` so `images` can be used.
   */
  mmprojPath?: string;
  requestId?: string;
  tools?: LLMTool[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onDone?: (opts: { aborted: boolean; reason?: string }) => void;
}

export interface GenerateResult {
  text: string;
  runtime: LocalRuntimeName;
  aborted: boolean;
}
