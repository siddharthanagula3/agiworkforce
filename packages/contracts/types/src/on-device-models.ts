export type OnDeviceRuntime =
  | 'apple-foundation-models'
  | 'executorch'
  | 'llama-rn'
  | 'litert-lm'
  | 'aicore';

export type OnDeviceTier = 1 | 2 | 3;

export interface ExecutorchPreset {
  modelName: string;
  modelSource: string;
  tokenizerSource: string;
  tokenizerConfigSource: string;
  capabilities?: readonly string[];
  generationConfig?: Readonly<Record<string, number>>;
}

export interface OnDeviceModel {
  id: string;
  displayName: string;
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
  executorchPreset?: ExecutorchPreset;
  downloadUrl?: string;
  checksum?: string;
  format?: 'gguf' | 'pte' | 'safetensors' | 'mlx' | 'onnx';
  mmprojUrl?: string;
  mmprojChecksum?: string;
  mmprojSizeBytes?: number;
}
