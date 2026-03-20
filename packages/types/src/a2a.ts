/**
 * Agent-to-Agent (A2A) Protocol Types
 *
 * Types for direct agent-to-agent communication within the AGI Workforce
 * platform. A2A enables a running agent to delegate sub-tasks to specialist
 * agents, hand off full conversations, and discover peer capabilities at
 * runtime.
 *
 * The protocol is intentionally transport-agnostic: messages can travel
 * over in-process function calls (desktop swarm), WebRTC data channels
 * (desktop↔mobile), or HTTP (distributed services).
 *
 * @module a2a
 * @packageDocumentation
 */

// ============================================================================
// Agent Card
// ============================================================================

/**
 * A capability advertisement published by an agent.
 *
 * Agent cards are exchanged during discovery so that orchestrator agents
 * can select the most suitable specialist for a given sub-task. Cards are
 * ephemeral — they reflect the agent's capabilities at the moment of
 * publication and may expire.
 *
 * @example
 * ```typescript
 * const card: A2AAgentCard = {
 *   agentId: 'agent-rust-expert',
 *   name: 'Rust Expert',
 *   version: '1.0.0',
 *   capabilities: ['code_review', 'refactor', 'explain_error'],
 *   supportedModels: ['claude-opus-4-6', 'gpt-5.4'],
 *   endpoint: 'local://swarm/agent-rust-expert',
 *   authRequired: false,
 *   metadata: { maxContextTokens: 200000 },
 * };
 * ```
 */
export interface A2AAgentCard {
  /** Unique, stable identifier for the agent instance. */
  agentId: string;

  /** Human-readable agent name shown in dashboards and logs. */
  name: string;

  /** Semantic version of the agent's capability set (semver string). */
  version: string;

  /**
   * List of named capabilities this agent advertises.
   *
   * Capability names are free-form strings (e.g., `"code_review"`,
   * `"web_search"`, `"file_edit"`). Orchestrators use them to route tasks.
   */
  capabilities: string[];

  /** LLM model identifiers this agent can operate with. */
  supportedModels: string[];

  /**
   * Transport endpoint for reaching this agent.
   *
   * Scheme examples:
   * - `local://swarm/<agentId>` — in-process desktop swarm
   * - `https://agents.internal/<agentId>` — HTTP service
   * - `webrtc://<signalingChannel>` — WebRTC data channel
   */
  endpoint: string;

  /** Whether callers must supply authentication credentials. */
  authRequired: boolean;

  /** Arbitrary metadata for capability negotiation. */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Task Request
// ============================================================================

/**
 * A task delegation request sent from one agent to another.
 *
 * The requesting agent describes what it needs done; the receiving agent
 * decides whether to accept and executes accordingly.
 *
 * @example
 * ```typescript
 * const request: A2ATaskRequest = {
 *   requestId: 'a2a-req-001',
 *   fromAgent: 'agent-orchestrator',
 *   taskDescription: 'Review this Rust function for memory safety issues',
 *   context: '```rust\nfn read_buffer(...)',
 *   timeoutSeconds: 60,
 *   priority: 'high',
 * };
 * ```
 */
export interface A2ATaskRequest {
  /** Unique request identifier for correlation with the response. */
  requestId: string;

  /** Agent ID of the requesting (delegating) agent. */
  fromAgent: string;

  /** Natural-language description of the task to perform. */
  taskDescription: string;

  /**
   * Optional additional context provided to the receiving agent
   * (e.g., relevant file contents, conversation summary).
   */
  context?: string;

  /** Maximum seconds the receiving agent should spend on this task. */
  timeoutSeconds?: number;

  /** Execution priority hint. Receiving agent may honour or ignore this. */
  priority: 'low' | 'normal' | 'high' | 'critical';
}

// ============================================================================
// Task Response
// ============================================================================

/**
 * The response returned by the receiving agent after processing a task request.
 *
 * @example
 * ```typescript
 * const response: A2ATaskResponse = {
 *   requestId: 'a2a-req-001',
 *   status: 'completed',
 *   result: 'No memory safety issues found. The buffer bounds are checked on line 12.',
 *   durationMs: 3200,
 * };
 * ```
 */
export interface A2ATaskResponse {
  /** Correlation identifier matching the originating `A2ATaskRequest.requestId`. */
  requestId: string;

  /**
   * Outcome status:
   * - `accepted`  -- Task received and queued; result will follow asynchronously.
   * - `completed` -- Task finished successfully; `result` is populated.
   * - `failed`    -- Task could not be completed; `error` is populated.
   * - `rejected`  -- Agent declined the task (out of scope, overloaded, etc.).
   */
  status: 'accepted' | 'completed' | 'failed' | 'rejected';

  /** Task output as a string (populated when status is `'completed'`). */
  result?: string;

  /** Error description (populated when status is `'failed'` or `'rejected'`). */
  error?: string;

  /** Wall-clock milliseconds from request receipt to response. */
  durationMs: number;
}

// ============================================================================
// Handoff Request
// ============================================================================

/**
 * A full conversation handoff from one agent to another.
 *
 * Unlike a task delegation (which is fire-and-forget), a handoff transfers
 * the entire conversation context so the receiving agent can continue
 * interacting with the user seamlessly.
 *
 * @example
 * ```typescript
 * const handoff: A2AHandoffRequest = {
 *   fromAgent: 'agent-generalist',
 *   toAgent: 'agent-tax-specialist',
 *   conversationContext: 'User is preparing their 2025 tax return and needs specialist advice.',
 *   messages: [
 *     { role: 'user',      content: 'I have a question about capital gains.' },
 *     { role: 'assistant', content: 'Sure — could you share the details?' },
 *   ],
 * };
 * ```
 */
export interface A2AHandoffRequest {
  /** Agent ID that is initiating the handoff. */
  fromAgent: string;

  /** Agent ID that should take over the conversation. */
  toAgent: string;

  /**
   * Free-text summary of the conversation so far.
   *
   * The receiving agent uses this as its initial working context,
   * enabling it to respond coherently without replaying all messages.
   */
  conversationContext: string;

  /**
   * Ordered message history to transfer.
   *
   * Should be the recent N messages (or a compacted version) rather than
   * the full unbounded history, to respect context window limits.
   */
  messages: Array<{
    /** Message author role. */
    role: string;
    /** Message text content. */
    content: string;
  }>;
}
