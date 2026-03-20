/**
 * Agent Types
 *
 * Shared types for AI agent configuration, execution, and lifecycle management
 * across all surfaces (desktop, web, mobile, extensions).
 *
 * @module agent
 * @packageDocumentation
 */

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Configuration for an AI agent instance.
 *
 * Defines the model, tools, constraints, and behavior for an agent.
 * Used when creating or updating agent definitions.
 *
 * @example
 * ```typescript
 * const config: AgentConfig = {
 *   name: 'Code Review Agent',
 *   model: 'claude-opus-4-6',
 *   provider: 'anthropic',
 *   systemPrompt: 'You are a thorough code reviewer...',
 *   maxIterations: 20,
 *   tools: ['read_file', 'write_file', 'bash'],
 *   autoApprove: false,
 *   temperature: 0.3,
 * };
 * ```
 */
export interface AgentConfig {
  /** Human-readable agent name. */
  name: string;

  /** LLM model identifier (e.g., `"claude-opus-4-6"`, `"gpt-5.4"`). */
  model: string;

  /** LLM provider identifier (e.g., `"anthropic"`, `"openai"`). */
  provider: string;

  /** System prompt that defines the agent's behavior and personality. */
  systemPrompt?: string;

  /** Maximum agentic loop iterations before force-stopping. */
  maxIterations?: number;

  /** Tool names the agent is allowed to use. Empty array means no tools. */
  tools?: string[];

  /** Whether tool calls are auto-approved without user confirmation. */
  autoApprove?: boolean;

  /** Sampling temperature for the LLM (0.0 to 2.0). */
  temperature?: number;

  /** Maximum tokens to generate per response. */
  maxTokens?: number;

  /** Optional skill template identifier from `.agi/employees/`. */
  skillTemplateId?: string;

  /** Arbitrary configuration metadata. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Agent Status
// ============================================================================

/**
 * Extended execution status of an agent with full lifecycle states.
 *
 * Extends the base `AgentStatus` (from `agent-status.ts`) with additional
 * states needed for the full agent lifecycle.
 *
 * - `idle` -- Agent is defined but not currently running.
 * - `thinking` -- Agent is processing input / generating a response.
 * - `working` -- Agent is executing a tool call or action.
 * - `waiting` -- Agent is waiting for user approval or external input.
 * - `paused` -- Agent has been manually paused.
 * - `completed` -- Agent has finished its task successfully.
 * - `error` -- Agent encountered an unrecoverable error.
 * - `cancelled` -- Agent was stopped by the user.
 */
export type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

// ============================================================================
// Agent
// ============================================================================

/**
 * A fully hydrated agent instance with runtime state.
 *
 * Combines the static configuration with live execution state. Used by
 * dashboards, mobile monitoring, and agent management UIs.
 *
 * @example
 * ```typescript
 * const agent: Agent = {
 *   id: 'agent-abc-123',
 *   config: { name: 'Code Review Agent', model: 'claude-opus-4-6', provider: 'anthropic' },
 *   status: 'working',
 *   currentAction: 'Reading src/main.rs',
 *   progress: 45,
 *   iterationCount: 3,
 *   maxIterations: 20,
 *   toolCallCount: 7,
 *   createdAt: '2026-03-15T10:30:00Z',
 *   startedAt: '2026-03-15T10:30:01Z',
 * };
 * ```
 */
export interface Agent {
  /** Unique agent instance identifier. */
  id: string;

  /** Agent configuration. */
  config: AgentConfig;

  /** Current execution status. */
  status: AgentLifecycleStatus;

  /** Description of what the agent is currently doing. Null when idle or finished. */
  currentAction?: string | null;

  /** Completion progress as a percentage (0-100). Null when indeterminate. */
  progress?: number | null;

  /** Current agentic loop iteration count (1-based). */
  iterationCount?: number;

  /** Maximum iterations allowed for this session. */
  maxIterations?: number;

  /** Number of tool calls executed so far. */
  toolCallCount?: number;

  /** Error message when status is `'error'`. */
  error?: string | null;

  /** ISO 8601 timestamp when the agent was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the agent started executing. Null if not yet started. */
  startedAt?: string | null;

  /** ISO 8601 timestamp when the agent finished. Null while running. */
  completedAt?: string | null;

  /** Conversation identifier this agent is operating within. */
  conversationId?: string;

  /** User ID that owns this agent. */
  userId?: string;
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Record of a single tool execution by an agent.
 *
 * Captures the full lifecycle of a tool call: what was called, with what
 * arguments, what it returned, and how long it took.
 *
 * @example
 * ```typescript
 * const execution: ToolExecution = {
 *   id: 'tool-exec-xyz',
 *   agentId: 'agent-abc-123',
 *   toolName: 'mcp__filesystem__read_file',
 *   displayName: 'Read',
 *   args: { path: 'src/main.rs' },
 *   status: 'completed',
 *   result: '// file contents...',
 *   durationMs: 45,
 *   startedAt: '2026-03-15T10:30:05Z',
 *   completedAt: '2026-03-15T10:30:05.045Z',
 * };
 * ```
 */
export interface ToolExecution {
  /** Unique execution identifier. */
  id: string;

  /** Agent that initiated this tool call. */
  agentId: string;

  /** Raw tool name (e.g., `"mcp__filesystem__read_file"`). */
  toolName: string;

  /** Human-readable display name (e.g., `"Read"`, `"Bash"`). */
  displayName?: string;

  /** Arguments passed to the tool. */
  args?: Record<string, unknown>;

  /** Execution status. */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** Tool result (truncated for transport). */
  result?: string;

  /** Error message when status is `'failed'`. */
  error?: string;

  /** Wall-clock duration in milliseconds. */
  durationMs?: number;

  /** ISO 8601 timestamp when the tool call started. */
  startedAt: string;

  /** ISO 8601 timestamp when the tool call completed. Null while running. */
  completedAt?: string | null;
}

// ============================================================================
// Approval Request
// ============================================================================

/**
 * A request for user approval before executing a sensitive tool call.
 *
 * Extends the base `ApprovalRequest` (from `runtime.ts`) with agent-specific
 * fields for tracking which agent initiated the request.
 *
 * @example
 * ```typescript
 * const request: AgentApprovalRequest = {
 *   id: 'approval-xyz',
 *   agentId: 'agent-abc-123',
 *   toolName: 'bash',
 *   displayName: 'Bash',
 *   description: 'Execute: rm -rf node_modules',
 *   args: { command: 'rm -rf node_modules' },
 *   riskLevel: 'high',
 *   status: 'pending',
 *   requestedAt: '2026-03-15T10:30:10Z',
 * };
 * ```
 */
export interface AgentApprovalRequest {
  /** Unique approval request identifier. */
  id: string;

  /** Agent that triggered this approval request. */
  agentId: string;

  /** Raw tool name. */
  toolName: string;

  /** Human-readable tool label. */
  displayName?: string;

  /** Human-readable description of what the tool will do. */
  description: string;

  /** Arguments the tool will be called with. */
  args?: Record<string, unknown>;

  /** Risk level assigned by ToolGuard. */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  /** Current approval status. */
  status: 'pending' | 'approved' | 'denied' | 'expired';

  /** Human-readable reason why approval is needed. */
  reason?: string;

  /** ISO 8601 timestamp when the request was created. */
  requestedAt: string;

  /** ISO 8601 timestamp when the user responded. Null while pending. */
  respondedAt?: string | null;

  /** Surface from which the user responded (e.g., `"mobile"`, `"desktop"`). */
  respondedFrom?: string;

  /** Conversation identifier for context. */
  conversationId?: string;
}
