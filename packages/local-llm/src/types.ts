// Runtime tier identifiers matching PRD-MOBILE §8 and DB schema.
export type LocalRuntimeName = 'foundation_models' | 'aicore' | 'executorch' | 'llama_rn';

export type LocalRuntimeTier = 1 | 2 | 3;

export interface DeviceCapabilities {
  totalRAMMB: number;
  osVersion: string;
  thermalThrottled: boolean;
  tier1Available: boolean;
  tier1Runtime: 'foundation_models' | 'aicore' | null;
  tier2Available: boolean;
  tier3Available: true;
}

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
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];
  requestId?: string;
  tools?: LLMTool[];
  onToken?: (token: string) => void;
  onDone?: (opts: { aborted: boolean; reason?: string }) => void;
}

export interface GenerateResult {
  text: string;
  runtime: LocalRuntimeName;
  aborted: boolean;
}

export interface LocalModel {
  id: string;
  name: string;
  filePath?: string;
  sizeBytes: number;
  supportedTiers: LocalRuntimeTier[];
  license: string;
}

export type LocalModelId =
  | 'qwen2.5-1.5b-instruct-q4_k_m'
  | 'llama-3.2-3b-instruct-q4'
  | 'gemma-3-4b-vision-q4'
  | 'whisper-base-en'
  | 'nomic-embed-text-v1.5-q8'
  | 'system';
