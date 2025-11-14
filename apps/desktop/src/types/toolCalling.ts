/**
 * Tool Calling Types
 *
 * Types for displaying AI tool/function calls and their results in the chat interface.
 * Supports multi-step agent workflows, streaming execution, and rich data visualization.
 */

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
  | 'pending' // Waiting to execute
  | 'in_progress' // Currently executing
  | 'completed' // Successfully completed
  | 'failed' // Execution failed
  | 'cancelled' // User cancelled
  | 'awaiting_approval'; // Waiting for user approval

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
  value?: unknown; // Actual value for this invocation
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
  dependencies: string[]; // Other tool IDs this depends on
}

export interface ToolCall {
  id: string; // Unique ID for this specific invocation
  tool_id: string; // ID of the tool being called
  tool_name: string;
  tool_description: string;
  parameters: Record<string, unknown>;
  status: ToolExecutionStatus;
  created_at: string; // ISO timestamp
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  requires_approval?: boolean; // Whether this is a dangerous operation
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
  output_type?: ToolResultType; // Hint for visualization
  artifacts?: ToolArtifact[]; // Files, images, etc. produced
}

export type ToolResultType =
  | 'text' // Plain text output
  | 'json' // JSON data
  | 'table' // Tabular data (e.g., database results)
  | 'image' // Image file
  | 'code' // Code with syntax highlighting
  | 'diff' // File diff
  | 'markdown' // Markdown content
  | 'html' // HTML content
  | 'error' // Error message
  | 'chart' // Chart/graph data
  | 'network' // Network graph data
  | 'logs'; // Log output

export interface ToolArtifact {
  id: string;
  type: 'file' | 'image' | 'data' | 'url';
  name: string;
  path?: string; // Local file path
  url?: string; // Remote URL
  data?: string; // Base64 encoded data
  mime_type?: string;
  size?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionStep {
  step_number: number;
  tool_call: ToolCall;
  result?: ToolResult;
  children?: ToolExecutionStep[]; // Nested tool calls (for dependencies)
}

export interface ToolExecutionWorkflow {
  id: string;
  goal_id?: string; // Associated AGI goal ID
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

// UI-specific types for streaming and interactivity

export interface ToolCallStreamChunk {
  tool_call_id: string;
  chunk_type: 'parameter' | 'output' | 'progress' | 'status';
  data: unknown;
  timestamp: string;
}

export interface ToolCallUI extends ToolCall {
  streaming?: boolean; // Still receiving updates
  expanded?: boolean; // User has expanded the details
  highlighted?: boolean; // Highlighted for attention
}

export interface ToolResultUI extends ToolResult {
  copied?: boolean; // Copy to clipboard indicator
  expanded?: boolean; // Expanded view
}

// Tauri event payloads for tool execution

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
  reason: string; // Why approval is needed
  risk_level: 'low' | 'medium' | 'high';
}

// Visualization-specific types

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

// Tool registry for frontend

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  available: boolean; // Whether the tool is currently available
  last_used?: string; // ISO timestamp
  usage_count?: number;
  average_duration_ms?: number;
}
