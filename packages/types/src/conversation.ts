/**
 * Shared conversation and message contracts for the AGI Workforce platform.
 *
 * These types define the cross-surface contract for conversations, messages,
 * artifacts, and runtime activity. Each surface may extend these with
 * surface-specific fields (e.g., desktop uses numeric IDs from SQLite,
 * mobile uses string IDs from the API).
 *
 * ## Stability notes
 *
 * **Stable (shared now)**:
 *   - MessageRole, ArtifactType, Artifact core shape
 *   - ApprovalRequest, RiskLevel
 *   - ToolCallStatus, RuntimeActivityStep
 *
 * **Unstable (remain surface-local for now)**:
 *   - Full Message/Conversation shapes (ID types differ)
 *   - Desktop: ToolCallUI, ToolResultUI, ToolExecutionWorkflow
 *   - Mobile: StreamChunk, ImageGen fields
 *   - Web: ResearchTask, ResearchStep
 *
 * Canonical source: this file.
 */

/** Roles a message can have in a conversation. */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Artifact types produced by AI models.
 *
 * Superset of all surface variants. Not all surfaces support all types.
 */
export type ArtifactType =
  | 'code'
  | 'chart'
  | 'diagram'
  | 'table'
  | 'mermaid'
  | 'spreadsheet'
  | 'presentation'
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'search'
  | 'document'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'svg'
  | 'email'
  | 'research';

/** Core artifact shape shared across all surfaces. */
export interface ArtifactBase {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

/** Risk level for tool approval requests. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Tool approval request — shared contract for desktop and mobile. */
export interface ApprovalRequestBase {
  id: string;
  toolName: string;
  description: string;
  riskLevel: RiskLevel;
  status: 'pending' | 'approved' | 'rejected';
}

/** Status of a tool call execution. */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Runtime activity step displayed in the transcript.
 *
 * Used by both desktop (inline activity) and mobile (status steps)
 * to show agentic loop progress.
 */
export interface RuntimeActivityStep {
  id: string;
  icon?: string;
  message: string;
  detail?: string;
  progress?: number;
  status: 'running' | 'completed' | 'failed';
}

/**
 * File attachment — shared shape for message attachments.
 */
export interface FileAttachmentBase {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}
