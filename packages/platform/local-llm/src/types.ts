export type LocalRuntimeName = 'foundation_models' | 'aicore' | 'executorch' | 'llama_rn';

export type LocalRuntimeTier = 1 | 2 | 3;

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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type LLMTool = object;

export interface GenerateOptions {
  modelId?: string;
  prompt: string;
  systemPrompt?: string;
  messages?: ChatMessage[];
  images?: string[];
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
