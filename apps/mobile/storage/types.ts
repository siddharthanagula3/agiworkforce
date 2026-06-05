export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type ModelRuntime = 'local' | 'cloud';
export type ModelFormat = 'gguf' | 'safetensors' | 'mlx' | 'onnx' | 'pte';
export type ChatMode = 'chat' | 'agent' | 'voice';

export interface Conversation {
  id: string;
  title: string;
  default_mode: ChatMode;
  default_provider: string | null;
  default_model: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  pinned: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  mode: ChatMode;
  provider: string | null;
  model: string | null;
  runtime: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  duration_ms: number | null;
  attachments: string | null;
  created_at: number;
  parent_message_id: string | null;
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
  display_name: string;
  family?: string;
  runtime: ModelRuntime;
  format: ModelFormat;
  size_bytes: number;
  sha256: string | null;
  local_path: string | null;
  installed_at: number;
  last_used_at: number | null;
  capabilities: string | null;
}

export interface CustomInstruction {
  id: string;
  name: string;
  content: string;
  active: boolean;
  created_at: number;
}

export interface TelemetryEvent {
  id: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: number;
  sent_at: number | null;
}
