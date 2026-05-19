// AUDIT-FIX: storage layer is half-shipped from the mobile reorg. These types
// satisfy the imports declared in storage/index.ts so the workspace typechecks.
// Real schemas to be reinstated as a follow-up.

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type ModelRuntime = 'local' | 'cloud' | 'byok';
export type ModelFormat = 'gguf' | 'safetensors' | 'mlx' | 'onnx';
export type ChatMode = 'chat' | 'agent' | 'voice';

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: number;
}

export interface MemoryFact {
  id: string;
  fact: string;
  source_conversation_id: string | null;
  pinned: boolean;
  created_at: number;
}

export interface InstalledModel {
  id: string;
  family: string;
  runtime: ModelRuntime;
  format: ModelFormat;
  size_bytes: number;
  installed_at: number;
}

export interface ProviderKeyRecord {
  provider: string;
  key_ciphertext: string;
  created_at: number;
}

export interface CustomInstruction {
  id: string;
  content: string;
  created_at: number;
}

export interface TelemetryEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: number;
}
