# Architecture Overview

AGI Workforce is built as a multi-tier, distributed system designed around a **chat-first, undo-based safety model**.

## System Diagram

```
                    Client Tier
Desktop App                           Web App
(Tauri + React)                       (Next.js)
Primary AGI/Automation                Billing & Subscriptions
     |                                      |
     | Tauri Commands                       | HTTP/GraphQL
     | WebSocket                            | WebSocket
     v                                      v
                Application Tier
Rust Backend              API Gateway
(Tokio)          <------->  (Express)
     |                           |
     |                    Signaling Server
     |                      (WebSocket)
     v                           v
                   Data Tier
SQLite                        PostgreSQL
(Local)                       (Supabase)
     |                           |
Redis                         S3/Storage
(Cache/Queue)                 (Files)
     |                           |
     v                           v
               External Services
OpenAI | Anthropic | Google | Stripe | Supabase | MCP Servers
```

## Core Architectural Principles

| Principle              | Implementation                                         |
| ---------------------- | ------------------------------------------------------ |
| **Chat-First UI**      | All functionality accessible through natural language  |
| **Full Autonomy**      | AI completes goals end-to-end without approval prompts |
| **Undo-Based Safety**  | All actions reversible; users can undo at any time     |
| **Hidden Complexity**  | MCP servers, API configs are automatic/invisible       |
| **Managed LLM Access** | Users never configure API keys; we proxy and bill      |

## Component Architecture

### Desktop App (Primary)

The desktop app is the main application with full AGI capabilities:

```
apps/desktop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   └── UnifiedAgenticChat/  # Main chat interface
│   ├── stores/             # Zustand state management
│   ├── hooks/              # React hooks
│   └── api/                # Tauri command wrappers
└── src-tauri/              # Rust backend
    └── src/
        ├── sys/            # System layer (commands, security)
        ├── core/           # Business logic (AGI, LLM, MCP)
        ├── data/           # Data access (SQLite, cache)
        └── automation/     # Workflow engine
```

### Web App (Billing Portal)

The web app handles subscriptions and account management:

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Authentication routes
│   ├── (dashboard)/        # Protected routes
│   └── api/                # API routes (Stripe, sync)
└── lib/
    ├── services/           # Business logic
    └── supabase/           # Database client
```

### Backend Services

```
services/
├── api-gateway/            # REST API (port 3000)
│   └── routes/             # Auth, sync, mobile endpoints
└── signaling-server/       # WebSocket (port 4000)
    └── Pairing protocol for device sync
```

## Data Flow

### Tauri Communication Pattern

```typescript
// Frontend invokes Rust command
const result = await invoke<ResultType>('command_name', { param1, param2 });

// Backend emits event
state.app_handle.emit_all('event-name', payload)?;

// Frontend listens for events
const unlisten = await listen<PayloadType>('event-name', (event) => {
  console.log('Event received:', event.payload);
});
```

### State Synchronization

```
User Action (Desktop)
     |
     v
Update Zustand Store
     |
     v
Invoke Tauri Command
     |
     v
Update SQLite
     |
     v
Emit Tauri Event
     |
     v
Send WebSocket Message
     |
     v
Other Devices
```

## AGI System

The AGI operates with **full autonomy** - completing goals without step-by-step approval. Safety comes from **reversibility**.

### Reasoning Loop

```
User Goal → Planner → Executor → Reflection → Complete/Iterate
                         |
                         v
                  Undo Action Log
```

### Safety Limits

| Limit                | Value     | Event                     |
| -------------------- | --------- | ------------------------- |
| Max iterations       | 1000      | `agi:goal:max_iterations` |
| Absolute timeout     | 5 minutes | `agi:goal:timeout`        |
| Consecutive failures | 3         | Goal abandonment          |

## Related Documentation

- [Desktop Architecture](desktop.md)
- [Web Architecture](web.md)
- [Data Flow Details](data-flow.md)
- [Full Architecture](../../ARCHITECTURE.md)
