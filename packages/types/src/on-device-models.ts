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
}

export interface OnDeviceModel {
  id: string;
  displayName: string;
  family: 'qwen3' | 'qwen2.5-vl' | 'gemma4' | 'llama3.2' | 'phi4-mini' | 'apple-fm' | 'gemma3-1b';
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
    | 'system-model';
  shipsInV1: boolean;
  liteMode?: boolean;
  /** Pre-built ExecuTorch preset for react-native-executorch LLMModule. Present when 'executorch' is in supportedRuntimes. */
  executorchPreset?: ExecutorchPreset;
  /** HTTPS URL to download the model file. Required for needsDownload models. */
  downloadUrl?: string;
  /** SHA-256 hex digest of the model file for integrity verification. */
  checksum?: string;
  /** File format: 'gguf' | 'pte' | 'safetensors' | 'mlx' | 'onnx' | 'task'. Required when downloadUrl is present. */
  format?: 'gguf' | 'pte' | 'safetensors' | 'mlx' | 'onnx' | 'task';
}
