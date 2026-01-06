export type ToolCapability =
  | 'FileRead'
  | 'FileWrite'
  | 'CodeExecution'
  | 'UIAutomation'
  | 'BrowserAutomation'
  | 'DatabaseAccess'
  | 'APICall'
  | 'ImageProcessing'
  | 'AudioProcessing'
  | 'CodeAnalysis'
  | 'TextProcessing'
  | 'DataAnalysis'
  | 'NetworkOperation'
  | 'SystemOperation'
  | 'Learning'
  | 'Planning';

export type ToolExecutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval';

export type ToolParameterType =
  | 'String'
  | 'Integer'
  | 'Float'
  | 'Boolean'
  | 'Object'
  | 'Array'
  | 'FilePath'
  | 'URL';

export interface ToolParameter {
  name: string;
  parameter_type: ToolParameterType;
  required: boolean;
  description: string;
  default?: unknown;
  value?: unknown;
}

export interface ResourceUsage {
  cpu_percent: number;
  memory_mb: number;
  network_mb: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: ToolCapability[];
  parameters: ToolParameter[];
  estimated_resources: ResourceUsage;
  dependencies: string[];
}

export interface ToolCall {
  id: string;
  tool_id: string;
  tool_name: string;
  tool_description: string;
  parameters: Record<string, unknown>;
  status: ToolExecutionStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  requires_approval?: boolean;
  approved?: boolean;
  approved_at?: string;
  approved_by?: string;
}

export interface ToolResult {
  tool_call_id: string;
  success: boolean;
  data: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  output_type?: ToolResultType;
  artifacts?: ToolArtifact[];
}

export type ToolResultType =
  | 'text'
  | 'json'
  | 'table'
  | 'image'
  | 'code'
  | 'diff'
  | 'markdown'
  | 'html'
  | 'error'
  | 'chart'
  | 'network'
  | 'logs';

export interface ToolArtifact {
  id: string;
  type: 'file' | 'image' | 'data' | 'url';
  name: string;
  path?: string;
  url?: string;
  data?: string;
  mime_type?: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionStep {
  step_number: number;
  tool_call: ToolCall;
  result?: ToolResult;
  children?: ToolExecutionStep[];
}

export interface ToolExecutionWorkflow {
  id: string;
  goal_id?: string;
  description: string;
  steps: ToolExecutionStep[];
  status: ToolExecutionStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total_duration_ms?: number;
  progress_percent?: number;
  current_step?: number;
  total_steps?: number;
}

export interface ToolCallStreamChunk {
  tool_call_id: string;
  chunk_type: 'parameter' | 'output' | 'progress' | 'status';
  data: unknown;
  timestamp: string;
}

export interface ToolCallUI extends ToolCall {
  streaming?: boolean;
  expanded?: boolean;
  highlighted?: boolean;
}

export interface ToolResultUI extends ToolResult {
  copied?: boolean;
  expanded?: boolean;
}

export interface ToolCallStartPayload {
  tool_call_id: string;
  tool_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  requires_approval?: boolean;
}

export interface ToolCallProgressPayload {
  tool_call_id: string;
  progress_percent: number;
  message?: string;
}

export interface ToolCallCompletePayload {
  tool_call_id: string;
  result: ToolResult;
  duration_ms: number;
}

export interface ToolCallErrorPayload {
  tool_call_id: string;
  error: string;
  error_type?: 'timeout' | 'permission_denied' | 'not_found' | 'execution_failed' | 'cancelled';
  retry_able?: boolean;
}

export interface ToolApprovalRequestPayload {
  tool_call_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  reason: string;
  risk_level: 'low' | 'medium' | 'high';
}

export interface TableData {
  columns: Array<{
    key: string;
    label: string;
    type?: 'string' | 'number' | 'boolean' | 'date';
  }>;
  rows: Array<Record<string, unknown>>;
  total_rows?: number;
  page?: number;
  page_size?: number;
}

export interface DiffData {
  file_path?: string;
  old_content?: string;
  new_content?: string;
  hunks: Array<{
    old_start: number;
    old_lines: number;
    new_start: number;
    new_lines: number;
    lines: Array<{
      type: 'add' | 'remove' | 'context';
      content: string;
      line_number?: number;
    }>;
  }>;
}

export interface NetworkGraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'tool' | 'api' | 'database' | 'file' | 'service';
    status?: 'success' | 'error' | 'pending';
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: 'call' | 'data_flow' | 'dependency';
    metadata?: Record<string, unknown>;
  }>;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  title?: string;
  data: Array<{
    label?: string;
    value: number;
    metadata?: Record<string, unknown>;
  }>;
  axes?: {
    x?: { label?: string; type?: 'linear' | 'time' | 'category' };
    y?: { label?: string; type?: 'linear' | 'logarithmic' };
  };
}

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  available: boolean;
  last_used?: string;
  usage_count?: number;
  average_duration_ms?: number;
}

// ============================================
// Tool Streaming Types
// ============================================

/**
 * Output chunk types for streaming tool output
 */
export type OutputChunkType = 'stdout' | 'stderr' | 'log' | 'data' | 'binary';

/**
 * Tool stream event types - matches Rust ToolStreamEvent enum
 */
export type ToolStreamEventType =
  | 'started'
  | 'progress'
  | 'output_chunk'
  | 'completed'
  | 'error'
  | 'cancelled';

/**
 * Base payload for tool stream events
 */
export interface ToolStreamEventBase {
  type: ToolStreamEventType;
  tool_id: string;
}

/**
 * Tool execution started event
 */
export interface ToolStreamStartedEvent extends ToolStreamEventBase {
  type: 'started';
  tool_name: string;
  parameters?: Record<string, unknown>;
  estimated_duration_ms?: number;
}

/**
 * Tool execution progress event
 */
export interface ToolStreamProgressEvent extends ToolStreamEventBase {
  type: 'progress';
  /** Progress value between 0.0 and 1.0 */
  progress: number;
  message?: string;
  bytes_processed?: number;
  bytes_total?: number;
}

/**
 * Tool output chunk event (for streaming output)
 */
export interface ToolStreamOutputChunkEvent extends ToolStreamEventBase {
  type: 'output_chunk';
  chunk: string;
  chunk_type?: OutputChunkType;
  is_final: boolean;
}

/**
 * Tool execution completed event
 */
export interface ToolStreamCompletedEvent extends ToolStreamEventBase {
  type: 'completed';
  result: unknown;
  duration_ms: number;
}

/**
 * Tool execution error event
 */
export interface ToolStreamErrorEvent extends ToolStreamEventBase {
  type: 'error';
  error: string;
  error_code?: string;
  duration_ms: number;
  retryable: boolean;
}

/**
 * Tool execution cancelled event
 */
export interface ToolStreamCancelledEvent extends ToolStreamEventBase {
  type: 'cancelled';
  reason?: string;
  duration_ms: number;
}

/**
 * Union type for all tool stream events
 */
export type ToolStreamEvent =
  | ToolStreamStartedEvent
  | ToolStreamProgressEvent
  | ToolStreamOutputChunkEvent
  | ToolStreamCompletedEvent
  | ToolStreamErrorEvent
  | ToolStreamCancelledEvent;

/**
 * Payload wrapper for tool stream events (matches Rust ToolStreamEventPayload)
 */
export interface ToolStreamEventPayload {
  event: ToolStreamEvent;
  timestamp: string;
  session_id?: string;
  agent_id?: string;
}

/**
 * State for tracking a streaming tool execution
 */
export interface ToolStreamState {
  tool_id: string;
  tool_name: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  progressMessage?: string;
  outputChunks: string[];
  outputBuffer: string;
  bytesProcessed?: number;
  bytesTotal?: number;
  result?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  duration_ms?: number;
  retryable?: boolean;
}

/**
 * Map of active tool streams by tool_id
 */
export type ToolStreamMap = Map<string, ToolStreamState>;

/**
 * Helper to create initial tool stream state
 */
export function createToolStreamState(
  event: ToolStreamStartedEvent,
  timestamp: string,
): ToolStreamState {
  return {
    tool_id: event.tool_id,
    tool_name: event.tool_name,
    status: 'running',
    progress: 0,
    outputChunks: [],
    outputBuffer: '',
    startedAt: new Date(timestamp),
  };
}

/**
 * Helper to update tool stream state from an event
 */
export function updateToolStreamState(
  state: ToolStreamState,
  event: ToolStreamEvent,
  timestamp: string,
): ToolStreamState {
  switch (event.type) {
    case 'started':
      return {
        ...state,
        tool_name: event.tool_name,
        status: 'running',
        progress: 0,
        startedAt: new Date(timestamp),
      };

    case 'progress':
      return {
        ...state,
        progress: event.progress,
        progressMessage: event.message,
        bytesProcessed: event.bytes_processed,
        bytesTotal: event.bytes_total,
      };

    case 'output_chunk':
      return {
        ...state,
        outputChunks: [...state.outputChunks, event.chunk],
        outputBuffer: state.outputBuffer + event.chunk,
      };

    case 'completed':
      return {
        ...state,
        status: 'completed',
        progress: 1.0,
        result: event.result,
        completedAt: new Date(timestamp),
        duration_ms: event.duration_ms,
      };

    case 'error':
      return {
        ...state,
        status: 'error',
        error: event.error,
        completedAt: new Date(timestamp),
        duration_ms: event.duration_ms,
        retryable: event.retryable,
      };

    case 'cancelled':
      return {
        ...state,
        status: 'cancelled',
        error: event.reason,
        completedAt: new Date(timestamp),
        duration_ms: event.duration_ms,
      };

    default:
      return state;
  }
}
