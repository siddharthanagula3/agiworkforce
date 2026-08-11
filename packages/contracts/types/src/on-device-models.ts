export type OnDeviceRuntime =
  | 'apple-foundation-models'
  | 'executorch'
  | 'llama-rn'
  | 'litert-lm'
  | 'aicore';

export type OnDeviceTier = 1 | 2 | 3;

/** Subset of the react-native-executorch preset constant shape needed for LLMModule.fromModelName. */
export interface ExecutorchPreset {
  modelName: string;
  modelSource: string;
  tokenizerSource: string;
  tokenizerConfigSource: string;
  /** Runtime capabilities required when loading this preset. */
  capabilities?: readonly string[];
  /** Catalog-owned model-card sampling configuration. */
  generationConfig?: Readonly<Record<string, number>>;
}

export interface OnDeviceModel {
  id: string;
  displayName: string;
  /** Catalog-owned opaque grouping. Consumers must branch on capabilities and roles. */
  family: string;
  paramCountB: number;
  fileSizeBytes: number;
  supportedRuntimes: OnDeviceRuntime[];
  contextWindow: number;
  capabilities: {
    text: boolean;
    visionIn: boolean;
    audioIn: boolean;
    toolCalls: boolean;
    structuredOutput: boolean;
  };
  license: string;
  role:
    | 'default'
    | 'premium-vision-pack'
    | 'premium-multimodal-alt'
    | 'lite-mode'
    | 'internal-eval-hedge'
    | 'system-multimodal';
  shipsInV1: boolean;
  liteMode?: boolean;
  /** Pre-built ExecuTorch preset for react-native-executorch LLMModule. Present when 'executorch' is in supportedRuntimes. */
  executorchPreset?: ExecutorchPreset;
  /** HTTPS URL to download the model file. Required for needsDownload models. */
  downloadUrl?: string;
  /** SHA-256 hex digest of the model file for integrity verification. */
  checksum?: string;
  /** File format: 'gguf' | 'pte' | 'safetensors' | 'mlx' | 'onnx'. Required when downloadUrl is present. */
  format?: 'gguf' | 'pte' | 'safetensors' | 'mlx' | 'onnx';
  /**
   * Vision projector (mmproj) artifact for multimodal GGUF models run through
   * llama.rn `initMultimodal`. This is a SECOND downloadable file alongside the
   * base `downloadUrl` GGUF — vision input is only effective when it is
   * installed. Present only for models whose `capabilities.visionIn` is a real,
   * mmproj-backed capability (see `effectiveVisionIn` in @agiworkforce/local-llm).
   */
  mmprojUrl?: string;
  /** SHA-256 hex digest of the mmproj vision-projector file. */
  mmprojChecksum?: string;
  /** Byte size of the mmproj vision-projector file. */
  mmprojSizeBytes?: number;
}
