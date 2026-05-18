export type OnDeviceRuntime =
  | 'apple-foundation-models'
  | 'executorch'
  | 'llama-rn'
  | 'litert-lm'
  | 'aicore';

export type OnDeviceTier = 1 | 2 | 3;

export interface OnDeviceModel {
  id: string;
  displayName: string;
  family: 'qwen3' | 'qwen2.5-vl' | 'gemma4' | 'llama3.2' | 'phi4-mini' | 'apple-fm' | 'gemini-nano';
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
}
