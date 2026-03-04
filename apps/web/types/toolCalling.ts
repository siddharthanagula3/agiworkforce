/**
 * Tool calling types for the web app
 * Provides proper type definitions for tool execution UI
 */

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

export interface ToolArtifact {
  data?: string;
  mime_type?: string;
  url?: string;
  name?: string;
  size?: number;
  [key: string]: unknown;
}

export interface TableColumn {
  key: string;
  label: string;
  type?: 'string' | 'number' | 'date' | 'boolean';
}

export interface TableData {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  page_size?: number;
}

export interface ToolApprovalRequestPayload {
  id: string;
  toolName: string;
  tool_name?: string;
  toolCallId: string;
  parameters: Record<string, unknown>;
  description?: string;
  reason?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  risk_level?: 'low' | 'medium' | 'high';
  requiredPermissions?: string[];
  createdAt?: Date | string;
}

export interface ToolCallUI {
  id: string;
  type: string;
  name: string;
  // snake_case aliases used in components
  tool_name?: string;
  tool_description?: string;
  tool_id?: string;
  parameters: Record<string, unknown>;
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'approved'
    | 'rejected'
    | 'in_progress'
    | 'awaiting_approval'
    | 'cancelled';
  result?: unknown;
  error?: string;
  startedAt?: Date | string;
  started_at?: string;
  completedAt?: Date | string;
  completed_at?: string;
  created_at?: string;
  duration?: number;
  duration_ms?: number;
  requiresApproval?: boolean;
  requires_approval?: boolean;
  expanded?: boolean;
  highlighted?: boolean;
  streaming?: boolean;
  approved?: boolean;
  approved_at?: string;
}

export interface ToolExecutionStep {
  id: string;
  toolCallId: string;
  stepNumber: number;
  // snake_case aliases used in components
  step_number?: number;
  tool_call: ToolCallUI;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, unknown>;
  output?: unknown;
  result?: ToolResultUI & { error?: string };
  error?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  children?: ToolExecutionStep[];
}

export interface ToolExecutionWorkflow {
  id: string;
  name: string;
  description?: string;
  steps: ToolExecutionStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'in_progress' | 'cancelled';
  startedAt?: Date | string;
  started_at?: string;
  completedAt?: Date | string;
  completed_at?: string;
  totalSteps: number;
  total_steps?: number;
  completedSteps: number;
  current_step?: number;
  total_duration_ms?: number;
  goal_id?: string;
}

export interface ToolResultContent {
  type: 'text' | 'image' | 'table' | 'diff' | 'code' | 'json';
  content: string | TableData | DiffData | ToolArtifact;
  language?: string;
  mimeType?: string;
}

export interface ToolResultUI {
  toolCallId: string;
  toolName: string;
  success: boolean;
  contents?: ToolResultContent[];
  // Additional properties used in components
  expanded?: boolean;
  data?: unknown;
  output_type?: 'json' | 'table' | 'image' | 'code' | 'diff' | 'markdown' | 'text' | 'error';
  artifacts?: ToolArtifact[];
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export const _stub = true;
export default {};
