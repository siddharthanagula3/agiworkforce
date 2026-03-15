/**
 * Shared Runtime Activity and Approval Contracts
 *
 * Platform-agnostic interfaces for tracking tool execution activity and
 * user approval requests across all surfaces.
 *
 * Desktop is the source of truth for runtime activity (tools execute there).
 * Other surfaces (web dashboard, mobile, VS Code) consume these shapes
 * via sync or real-time channels for monitoring and approval.
 *
 * @module runtime
 * @packageDocumentation
 */

// ============================================================================
// Runtime Activity
// ============================================================================

/** Type of runtime activity. */
export type RuntimeActivityType =
  | 'tool_call'
  | 'agent_action'
  | 'system_event'
  | 'mcp_request';

/** Execution status of a runtime activity. */
export type RuntimeActivityStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * A single unit of runtime activity (tool call, agent action, etc.).
 *
 * This is the cross-surface shape consumed by dashboards, mobile monitoring,
 * and VS Code status displays. Desktop emits these via the `tool:event`
 * channel; other surfaces receive them over WebSocket or polling.
 */
export interface RuntimeActivity {
  /** Unique activity identifier. */
  id: string;

  /** Category of activity. */
  type: RuntimeActivityType;

  /** Current execution status. */
  status: RuntimeActivityStatus;

  /** Raw tool/action name (e.g., `"mcp__filesystem__read_file"`). */
  toolName?: string;

  /** Human-readable display name (e.g., `"Read"`, `"Bash"`). */
  displayName?: string;

  /** Serialised arguments or parameters. */
  args?: Record<string, unknown>;

  /** Result summary (truncated for transport). */
  result?: string;

  /** ISO 8601 timestamp when the activity started. */
  startedAt: string;

  /** ISO 8601 timestamp when the activity completed (null while running). */
  completedAt?: string;

  /** Wall-clock duration in milliseconds (set on completion). */
  durationMs?: number;

  /** Error message when status is `"failed"`. */
  error?: string;

  /** Parent conversation identifier for correlation. */
  conversationId?: string;

  /** Agent session identifier for correlation. */
  agentSessionId?: string;
}

// ============================================================================
// Approval Request
// ============================================================================

/** Status of a tool approval request. */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

/**
 * A request for user approval before executing a sensitive tool.
 *
 * Desktop generates these when ToolGuard flags a tool call. Mobile and
 * web surfaces can display and respond to them in real-time.
 */
export interface ApprovalRequest {
  /** Unique request identifier. */
  id: string;

  /** Tool that requires approval. */
  toolName: string;

  /** Human-readable tool label. */
  displayName?: string;

  /** Parameters the tool will be called with. */
  params: Record<string, unknown>;

  /** Current approval status. */
  status: ApprovalStatus;

  /** Risk tier assigned by ToolGuard. */
  riskTier?: 'low' | 'medium' | 'high' | 'critical';

  /** Human-readable reason why approval is needed. */
  reason?: string;

  /** ISO 8601 timestamp when the request was created. */
  requestedAt: string;

  /** ISO 8601 timestamp when the user responded (null while pending). */
  respondedAt?: string;

  /** Who responded (e.g., `"mobile"`, `"desktop"`, `"web"`). */
  respondedFrom?: string;

  /** Parent conversation identifier. */
  conversationId?: string;
}
