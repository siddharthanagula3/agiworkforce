# Agent-to-Agent (A2A) Protocol

_Updated: 2026-03-19 | Wave 5 Feature_

## Overview

A2A enables task delegation, conversation handoffs, and capability discovery between agents running in the same or different AGI Workforce instances. The protocol is intentionally **transport-agnostic** — messages can travel over in-process function calls (desktop swarm), WebRTC data channels (desktop↔mobile), or HTTP (distributed services).

## Protocol Types

All types defined in `packages/types/src/a2a.ts`.

### Agent Card

An agent advertises its capabilities via a card published during discovery.

```typescript
interface A2AAgentCard {
  agentId: string; // Stable agent identifier
  name: string; // Human-readable name
  version: string; // Semantic version of capability set
  capabilities: string[]; // e.g., ["code_review", "refactor", "error_explanation"]
  supportedModels: string[]; // e.g., ["claude-opus-4-6", "gpt-4o"]
  endpoint: string; // Transport scheme: local://, https://, webrtc://
  authRequired: boolean; // Whether caller must provide credentials
  metadata: Record<string, unknown>; // Arbitrary capability negotiation data
}
```

**Transport Schemes**:

- `local://swarm/<agentId>` — in-process desktop swarm
- `https://agents.internal/<agentId>` — HTTP service in private network
- `webrtc://<signalingChannel>` — WebRTC data channel via signaling server

### Task Request

One agent delegates a sub-task to another via a task request.

```typescript
interface A2ATaskRequest {
  requestId: string; // UUID for correlation
  fromAgent: string; // Requesting agent ID
  taskDescription: string; // Natural-language task description
  context?: string; // Relevant file contents, conversation summary
  timeoutSeconds?: number; // Max execution time (default: 300)
  priority: 'low' | 'normal' | 'high' | 'critical';
}
```

**Example**:

````json
{
  "requestId": "a2a-req-001",
  "fromAgent": "agent-orchestrator",
  "taskDescription": "Review this Rust function for memory safety issues",
  "context": "```rust\nfn read_buffer(...)\n```",
  "timeoutSeconds": 60,
  "priority": "high"
}
````

### Task Response

The receiving agent responds with a status and result.

```typescript
interface A2ATaskResponse {
  requestId: string;
  status: 'accepted' | 'completed' | 'failed' | 'rejected';
  result?: string; // Task output (when status='completed')
  error?: string; // Error description (when status='failed'/'rejected')
  durationMs: number; // Wall-clock milliseconds from receipt to response
}
```

### Handoff Request

Full conversation handoff from one agent to another, enabling seamless specialist takeover.

```typescript
interface A2AHandoffRequest {
  fromAgent: string; // Agent initiating handoff
  toAgent: string; // Agent taking over
  conversationContext: string; // Summary of conversation so far
  messages: Array<{
    role: string; // 'user' | 'assistant'
    content: string; // Message text
  }>;
}
```

**Use Case**: A generalist agent handling a tax question recognizes it needs specialist knowledge and hands off to a tax-expert agent with full context.

## Execution Patterns

### Pattern 1: Task Delegation (Fire-and-Forget)

1. Orchestrator agent identifies a sub-task
2. Selects suitable specialist from available agents
3. Sends `A2ATaskRequest` via transport
4. Waits for `A2ATaskResponse` with result
5. Incorporates result into orchestrator's response

### Pattern 2: Capability Discovery

1. Orchestrator queries all peers for agent cards
2. Filters by `capabilities` matching the task
3. Sorts by `supportedModels` compatibility
4. Routes to highest-ranked agent

### Pattern 3: Conversation Handoff

1. Agent recognizes it lacks expertise for user's request
2. Identifies suitable specialist agent
3. Sends `A2AHandoffRequest` with full message history
4. Receives acknowledgment
5. Agent exits; specialist takes over

### Pattern 4: Swarm Consensus

Multiple agents work on same task in parallel, combine results:

```
orchestrator
  ├─ agent-code-quality
  ├─ agent-security
  └─ agent-performance
       ↓ (all respond with analysis)
       → Orchestrator synthesizes consensus
```

## Transport Layer

### In-Process (Desktop)

- Direct function calls via Rust function pointers
- No serialization overhead
- Used for swarm agents on same desktop instance

### WebRTC (Cross-Device)

- Signaling server coordinates peer connection
- Data channel carries serialized A2A messages
- Used for desktop ↔ mobile agent communication
- End-to-end encryption via WebRTC DTLS

### HTTP (Distributed Services)

- POST request to agent endpoint
- Request body: serialized `A2ATaskRequest`
- Response body: serialized `A2ATaskResponse`
- Optional mutual TLS (mTLS) authentication

## Security

1. **Authentication**: Optional; cards advertise `authRequired: boolean`
2. **Authorization**: Receiving agent can reject based on `priority`, `capabilities`, or resource constraints
3. **Timeout enforcement**: `timeoutSeconds` prevents resource exhaustion
4. **Input validation**: Task descriptions sanitized for prompt injection
5. **Audit logging**: All A2A messages logged with correlation IDs

## Future Enhancements

- **Async task polling**: Requesting agent polls for result status
- **Streaming results**: Long-running tasks stream partial results
- **Context compression**: Automatic summarization of message history before handoff
- **Multi-hop delegation**: Agent can delegate to another agent (chain of command)
- **SLA monitoring**: Automatic failover if agent doesn't respond in time
