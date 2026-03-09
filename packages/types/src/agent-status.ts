/**
 * Agent Status Types
 *
 * Shared types for tracking agent execution status across the platform.
 * Used by:
 *   - Web dashboard (AgentStatusPanel)
 *   - VS Code extension (status bar + quick pick)
 *   - Desktop app (dual-write to Supabase)
 *   - API gateway (polling endpoint)
 *
 * @module agent-status
 * @packageDocumentation
 */

// ============================================================================
// Agent Session Status
// ============================================================================

/**
 * Execution status of an agent session.
 *
 * - `running` — agent is actively executing tasks
 * - `completed` — agent finished successfully
 * - `failed` — agent encountered an unrecoverable error
 * - `paused` — agent is paused (awaiting user confirmation or budget check)
 * - `cancelled` — agent was manually stopped by the user
 */
export type AgentSessionStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

/** Possible states of an agent */
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error';

/**
 * Represents a single agent execution session.
 *
 * Tracked in the `agent_sessions` Supabase table (when available) or
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
 *   model: 'claude-opus-4.6',
 *   iterationCount: 3,
 *   maxIterations: 10,
 * };
 * ```
 */
export interface AgentSession {
  /** Unique identifier for this agent session. */
  id: string;

  /** Human-readable name of the agent or task. */
  name: string;

  /** Current execution status. */
  status: AgentSessionStatus;

  /**
   * Description of what the agent is currently doing.
   * Examples: "Reading src/main.rs", "Running cargo test", "Generating summary".
   * `null` when the agent has completed or failed.
   */
  currentAction: string | null;

  /** ISO 8601 timestamp when the session started. */
  startedAt: string;

  /**
   * ISO 8601 timestamp when the session completed or failed.
   * `null` while the agent is still running.
   */
  completedAt: string | null;

  /**
   * Completion progress as a percentage (0-100).
   * `null` when progress cannot be determined.
   */
  progress: number | null;

  /** The LLM model being used for this session, if known. */
  model?: string;

  /** Current iteration count in the agentic loop. */
  iterationCount?: number;

  /** Maximum iterations allowed for this session. */
  maxIterations?: number;

  /** Error message when status is 'failed'. */
  error?: string;

  /** Number of tool calls executed so far. */
  toolCallCount?: number;

  /** User ID that owns this session (for multi-user filtering). */
  userId?: string;
}

// ============================================================================
// Agent Status Summary (for badges and compact displays)
// ============================================================================

/**
 * Lightweight summary of agent activity, used for badges and status bar items.
 */
export interface AgentStatusSummary {
  /** Number of currently running agents. */
  running: number;

  /** Number of completed agents in the current session. */
  completed: number;

  /** Number of failed agents in the current session. */
  failed: number;

  /** Total number of tracked agent sessions. */
  total: number;
}

// ============================================================================
// Active Agent & Task Assignment
// ============================================================================

/** Represents an active agent with its current state */
export interface ActiveAgent {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
  lastActivity?: Date;
}

/** Task assigned to an agent */
export interface TaskAssignment {
  taskId: string;
  agentId: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}
