/**
 * Chat types for the web app
 * These mirror the desktop app's chat types but are standalone for web usage
 */

export type ArtifactType =
  | 'code'
  | 'markdown'
  | 'html'
  | 'svg'
  | 'mermaid'
  | 'json'
  | 'csv'
  | 'image'
  | 'video'
  | 'spreadsheet'
  | 'presentation'
  | 'chart'
  | 'diagram'
  | 'document'
  | 'table';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  mimeType?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolCallData {
  id: string;
  type: string;
  name: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ToolResultData {
  toolCallId: string;
  content: unknown;
  isError?: boolean;
  errorMessage?: string;
}

export interface ToolApprovalRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiredPermissions?: string[];
  createdAt: Date;
}

export interface ResearchTask {
  id: string;
  query: string;
  status: 'pending' | 'searching' | 'analyzing' | 'completed' | 'failed' | 'running';
  sources: ResearchSource[];
  summary?: string;
  steps?: ResearchStep[];
  findings?: string[];
  progress?: number;
  timeElapsed?: number | string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ResearchStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: number;
}

export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  fetchedAt: Date;
}

export interface ChatMessageMetadata {
  model?: string;
  tokensUsed?: number;
  cost?: number;
  processingTime?: number;
  temperature?: number;
}

export const _stub = true;
export default {};
