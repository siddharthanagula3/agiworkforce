export type OutputChunkType = 'stdout' | 'stderr' | 'log' | 'data' | 'binary';

export type ToolStreamEventType =
  'started' | 'progress' | 'output_chunk' | 'completed' | 'error' | 'cancelled';

export interface ToolStreamEventBase {
  type: ToolStreamEventType;
  tool_id: string;
}

export interface ToolStreamStartedEvent extends ToolStreamEventBase {
  type: 'started';
  tool_name: string;
  parameters?: Record<string, unknown>;
  estimated_duration_ms?: number;
}

export interface ToolStreamProgressEvent extends ToolStreamEventBase {
  type: 'progress';
  progress: number;
  message?: string;
  bytes_processed?: number;
  bytes_total?: number;
}

export interface ToolStreamOutputChunkEvent extends ToolStreamEventBase {
  type: 'output_chunk';
  chunk: string;
  chunk_type?: OutputChunkType;
  is_final: boolean;
}

export interface ToolStreamCompletedEvent extends ToolStreamEventBase {
  type: 'completed';
  result: unknown;
  duration_ms: number;
}

export interface ToolStreamErrorEvent extends ToolStreamEventBase {
  type: 'error';
  error: string;
  error_code?: string;
  duration_ms: number;
  retryable: boolean;
}

export interface ToolStreamCancelledEvent extends ToolStreamEventBase {
  type: 'cancelled';
  reason?: string;
  duration_ms: number;
}

export type ToolStreamEvent =
  | ToolStreamStartedEvent
  | ToolStreamProgressEvent
  | ToolStreamOutputChunkEvent
  | ToolStreamCompletedEvent
  | ToolStreamErrorEvent
  | ToolStreamCancelledEvent;

export interface ToolStreamEventPayload {
  event: ToolStreamEvent;
  timestamp: string;
  session_id?: string;
  agent_id?: string;
}
