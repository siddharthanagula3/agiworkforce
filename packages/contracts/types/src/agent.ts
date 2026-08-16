/**
 * Agent Types
 *
 * Shared types for AI agent configuration, execution, and lifecycle management
 * across all surfaces (desktop, web, mobile, extensions).
 *
 * @module agent
 * @packageDocumentation
 */

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
 *   model: selectedModel.id,
 *   provider: selectedModel.provider,
 *   systemPrompt: 'You are a thorough code reviewer...',
 *   maxIterations: 20,
 *   tools: ['read_file', 'write_file', 'bash'],
 *   autoApprove: false,
 *   temperature: 0.3,
 * };
 * ```
 */
export interface AgentConfig {
  name: string;

  model: string;

  provider: string;

  systemPrompt?: string;

  maxIterations?: number;

  tools?: string[];

  autoApprove?: boolean;

  temperature?: number;

  maxTokens?: number;

  skillTemplateId?: string;

  metadata?: Record<string, unknown>;
}

export type AgentLifecycleStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

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
 *   config: {
 *     name: 'Code Review Agent',
 *     model: selectedModel.id,
 *     provider: selectedModel.provider,
 *   },
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
  id: string;

  config: AgentConfig;

  status: AgentLifecycleStatus;

  currentAction?: string | null;

  progress?: number | null;

  iterationCount?: number;

  maxIterations?: number;

  toolCallCount?: number;

  error?: string | null;

  createdAt: string;

  startedAt?: string | null;

  completedAt?: string | null;

  conversationId?: string;

  userId?: string;
}

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
  id: string;

  agentId: string;

  toolName: string;

  displayName?: string;

  args?: Record<string, unknown>;

  status: 'pending' | 'running' | 'completed' | 'failed';

  result?: string;

  error?: string;

  durationMs?: number;

  startedAt: string;

  completedAt?: string | null;
}

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
  id: string;

  agentId: string;

  toolName: string;

  displayName?: string;

  description: string;

  args?: Record<string, unknown>;

  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  status: 'pending' | 'approved' | 'denied' | 'expired';

  reason?: string;

  requestedAt: string;

  respondedAt?: string | null;

  respondedFrom?: string;

  conversationId?: string;
}
