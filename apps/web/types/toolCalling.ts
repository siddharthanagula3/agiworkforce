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
  toolCallId: string;
  parameters: Record<string, unknown>;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiredPermissions?: string[];
  createdAt?: Date | string;
}

export interface ToolCallUI {
  id: string;
  type: string;
  name: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'approved' | 'rejected';
  result?: unknown;
  error?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  duration?: number;
  requiresApproval?: boolean;
}

export interface ToolExecutionStep {
  id: string;
  toolCallId: string;
  stepNumber: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
}

export interface ToolExecutionWorkflow {
  id: string;
  name: string;
  description?: string;
  steps: ToolExecutionStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  startedAt?: Date | string;
  completedAt?: Date | string;
  totalSteps: number;
  completedSteps: number;
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
  contents: ToolResultContent[];
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export const _stub = true;
export default {};
