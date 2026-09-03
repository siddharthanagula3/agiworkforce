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

export interface A2AHandoffRequest {
  fromAgent: string;

  toAgent: string;

  conversationContext: string;

  messages: Array<{
    role: string;
    content: string;
  }>;
}
