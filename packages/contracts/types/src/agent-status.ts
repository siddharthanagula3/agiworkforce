/**
 * Agent Status Types
 *
 * Shared types for tracking agent execution status across the platform.
 * Used by:
 *   - Web dashboard (AgentStatusPanel)
 *   - VS Code extension (status bar + quick pick)
 *   - Desktop app (dual-write to managed cloud DB)
 *   - API gateway (polling endpoint)
 *
 * @module agent-status
 * @packageDocumentation
 */

export type AgentSessionStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error';

/**
 * Represents a single agent execution session.
 *
 * Tracked in the `agent_sessions` cloud table (when available) or
 * polled from the API gateway. The desktop app dual-writes these records
 * so that the web dashboard and VS Code extension can display live status.
 *
 * @example
 * ```typescript
 * const session: AgentSession = {
 *   id: 'agent-session-abc-123',
 *   name: 'Code Review Agent',
 *   status: 'running',
 *   currentAction: 'Analyzing src/main.rs',
 *   startedAt: '2026-03-08T10:30:00Z',
 *   progress: 45,
 *   model: selectedModel.id,
 *   iterationCount: 3,
 *   maxIterations: 10,
 * };
 * ```
 */
export interface AgentSession {
  id: string;

  name: string;

  status: AgentSessionStatus;

  currentAction: string | null;

  startedAt: string;

  completedAt: string | null;

  progress: number | null;

  model?: string;

  iterationCount?: number;

  maxIterations?: number;

  error?: string;

  toolCallCount?: number;

  userId?: string;
}

export interface AgentStatusSummary {
  running: number;

  completed: number;

  failed: number;

  total: number;
}

export interface ActiveAgent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
  lastActivity?: Date;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}
