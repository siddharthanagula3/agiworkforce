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
 *   supportedModels: catalogModels.map(({ id }) => id),
 *   endpoint: 'local://swarm/agent-rust-expert',
 *   authRequired: false,
 *   metadata: { maxContextTokens: 200000 },
 * };
 * ```
 */
export interface A2AAgentCard {
  agentId: string;

  name: string;

  version: string;

  capabilities: string[];

  supportedModels: string[];

  endpoint: string;

  authRequired: boolean;

  metadata: Record<string, unknown>;
}

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
  requestId: string;

  fromAgent: string;

  taskDescription: string;

  context?: string;

  timeoutSeconds?: number;

  priority: 'low' | 'normal' | 'high' | 'critical';
}

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
  requestId: string;

  status: 'accepted' | 'completed' | 'failed' | 'rejected';

  result?: string;

  error?: string;

  durationMs: number;
}

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
  fromAgent: string;

  toAgent: string;

  conversationContext: string;

  messages: Array<{
    role: string;
    content: string;
  }>;
}
