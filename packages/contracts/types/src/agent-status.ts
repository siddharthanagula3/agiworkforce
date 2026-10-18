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

import type { LifecycleProjection, WorkLifecycleStatus } from './lifecycle-status';

export type AgentSessionStatus = Exclude<WorkLifecycleStatus, 'pending'> | 'paused';

export const LIFECYCLE_STATUS_BY_AGENT_SESSION_STATUS: LifecycleProjection<AgentSessionStatus> =
  Object.freeze({
    running: 'running',
    completed: 'completed',
    failed: 'failed',
    paused: 'awaiting_input',
    cancelled: 'cancelled',
  });

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
