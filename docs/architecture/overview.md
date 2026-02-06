# AGI Workforce Architecture

**Version 1.0.6** | January 2026

This document provides a comprehensive overview of the AGI Workforce system architecture, design patterns, and technical implementation details.

## Table of Contents

- [System Overview](#system-overview)
- [Product Architecture Philosophy](#product-architecture-philosophy)
- [Desktop Application Architecture](#desktop-application-architecture)
- [Intelligent Model Router](#intelligent-model-router)
- [Web Application Architecture](#web-application-architecture)
- [Backend Services Architecture](#backend-services-architecture)
- [Data Flow Patterns](#data-flow-patterns)
- [Security Architecture](#security-architecture)
- [AGI System Design](#agi-system-design)
- [Undo System Architecture](#undo-system-architecture)
- [MCP Integration](#mcp-integration)
- [Performance Optimization](#performance-optimization)
- [Deployment Architecture](#deployment-architecture)

## System Overview

AGI Workforce is built as a multi-tier, distributed system designed around a **chat-first, undo-based safety model**. Users interact entirely through natural language, and the AI operates autonomously while ensuring all actions are reversible.

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

## Product Architecture Philosophy

AGI Workforce follows a **chat-first architecture** where the chat interface is the primary (and often only) way users interact with the system. This architectural decision drives every component design.

### Core Architectural Principles

| Principle              | Implementation                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Chat-First UI**      | All functionality accessible through natural language; no visual workflow builders |
| **Full Autonomy**      | AI completes goals end-to-end without step-by-step approval prompts                |
| **Undo-Based Safety**  | All actions reversible; users can "undo" at any time                               |
| **Hidden Complexity**  | MCP servers, API configurations, and technical details are automatic/invisible     |
| **Managed LLM Access** | Users never configure API keys; we proxy and bill for all LLM usage                |

### Intentionally Removed Components

The following component directories were intentionally deleted in v1.0.6 to align with the chat-first vision:

- `Configurator/` - Visual configuration screens (replaced by AI-driven configuration)
- `Orchestration/` - Visual workflow builder (replaced by natural language goal specification)
- `MissionControl/` - Dashboard-style monitoring (replaced by chat-based status updates)
- `Onboarding/` - Setup wizard (replaced by immediate chat access)

These components represented a visual-workflow approach that conflicted with the chat-first vision. Users now simply open the app and start chatting immediately.

### Current Component Architecture

The desktop app uses **feature-based component organization**:

```
apps/desktop/src/components/
├── AGI/                      # AGI-related components
├── Auth/                     # Authentication UI
├── Browser/                  # Browser automation components
├── CustomInstructions/       # Custom instructions dialog
│   └── CustomInstructionsDialog.tsx
├── ErrorHandling/            # Error boundary & reporting
│   ├── ErrorBoundary.tsx     # React error boundary
│   └── __tests__/            # Error handling tests
├── Onboarding/               # User onboarding flow
│   └── OnboardingWelcome.tsx # Welcome screen for new users
├── SimpleMode/               # Simple/Advanced mode toggle
│   └── SimpleModeToggle.tsx  # Mode switcher component
├── Subscription/             # Subscription gate & dialogs
│   ├── SubscriptionGate.tsx  # Full-screen subscription gate
│   └── SubscriptionLockDialog.tsx # Modal subscription dialog
├── UnifiedAgenticChat/       # Main chat interface (primary UI)
│   ├── AppLayout.tsx         # Root layout with sidebar + chat
│   ├── ChatInputArea.tsx     # Natural language input
│   ├── ChatMessageList.tsx   # Conversation history
│   ├── ChatStream.tsx        # Real-time AI responses
│   ├── MessageBubble.tsx     # Individual messages
│   ├── QuickModelSelector.tsx # Auto/manual model selection
│   ├── DynamicSidecar.tsx    # Context panels (code, terminal, browser)
│   ├── CheckpointManager.tsx # Undo/redo functionality
│   ├── StatusTrail.tsx       # Goal execution progress
│   ├── ArtifactRenderer.tsx  # Rich content display
│   ├── Cards/                # Action-specific cards
│   ├── InlinePanels/         # Embedded workspace panels
│   └── Sidecar/              # Side panel components
└── ui/                       # Shared UI primitives (Button, Dialog, etc.)
```

## Desktop Application Architecture

### Frontend Architecture (React)

The desktop frontend follows a simplified, chat-centric architecture:

```
                         UI Layer
  UnifiedAgenticChat | Workspaces | Common Components
                           |
                           v
                  State Management Layer
  Zustand Stores (10 domain stores) | React Query
                           |
                           v
                   Communication Layer
  Tauri Bridge | Event Listeners | Command Invocations
```

#### Zustand State Management

State is consolidated into approximately 10 domain-specific stores (down from 40+ granular stores):

```typescript
// Recommended store pattern
const useStore = create<State>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // State
        data: initialData,

        // Actions
        updateData: (newData) => set({ data: newData }),

        // Computed selectors
        getFilteredData: () => {
          const state = get();
          return filterData(state.data);
        },
      })),
      {
        name: 'store-name',
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { name: 'StoreName', enabled: import.meta.env.DEV },
  ),
);

// Optimized selectors
export const selectData = (state: State) => state.data;
```

**Key Stores:**

- `useChatStore` - Chat messages, conversations, and AI responses
- `useSettingsStore` - User preferences and configuration
- `useAGIStore` - AGI goals, tasks, and execution state
- `useModelStore` - Model selection and routing preferences
- `useUndoStore` - Undo/redo action history
- `useAuthStore` - Authentication state and session management

### Backend Architecture (Rust)

The Rust backend is organized into modular layers:

```
apps/desktop/src-tauri/src/
  sys/                    # System layer
    commands/             # Tauri command handlers
    security/             # Security policies and encryption
    events/               # Event emission and handling
    billing/              # Stripe integration

  core/                   # Business logic layer
    agi/                  # AGI reasoning system
      core.rs             # Main AGI loop
      planner.rs          # Task planning
      executor.rs         # Task execution
      reflection.rs       # Learning and reflection
    agent/                # Agent systems
      autonomous.rs       # Autonomous agent
      planner.rs          # Planning algorithms
      code_generator.rs   # Code generation
    llm/                  # LLM integration
      router.rs           # Multi-provider routing
      providers/          # Provider implementations
      tool_executor.rs    # Tool/function calling
    mcp/                  # Model Context Protocol
      registry.rs         # Server registry
      manager.rs          # Server lifecycle
      session.rs          # Session management
    undo/                 # Undo system
      action_log.rs       # Action history
      rollback.rs         # State restoration

  data/                   # Data access layer
    db/                   # SQLite database
      repository.rs       # Data access patterns
      migrations.rs       # Schema migrations
    cache/                # Caching layer
    settings/             # Settings persistence

  automation/             # Automation layer
    workflow.rs           # Workflow engine
    vision_planner.rs     # Visual automation
    scheduler.rs          # Task scheduling

  integrations/           # External integrations
    github.rs             # GitHub API
    browser.rs            # Browser automation
    terminal.rs           # Terminal integration
```

#### Tauri Command Pattern

Commands follow a consistent pattern with error handling:

```rust
#[tauri::command]
pub async fn command_name(
    param1: Type1,
    param2: Type2,
    state: State<'_, AppState>,
) -> Result<ReturnType, String> {
    // Validate inputs
    validate_input(&param1)?;

    // Access shared state
    let data = state.data.lock().await;

    // Execute business logic
    let result = business_logic(param1, param2).await
        .map_err(|e| format!("Error: {}", e))?;

    // Emit events if needed
    state.app_handle.emit_all("event-name", &result)?;

    Ok(result)
}
```

#### Async Runtime (Tokio)

All async operations use Tokio runtime with proper error handling:

```rust
// Spawn background task
tokio::spawn(async move {
    loop {
        // Background work
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
});

// Concurrent operations
let (result1, result2) = tokio::join!(
    operation1(),
    operation2()
);

// Timeout wrapper
tokio::time::timeout(
    Duration::from_secs(30),
    long_running_operation()
).await??;
```

### SQLite Database Design

The local database uses Write-Ahead Logging (WAL) for better concurrency:

```rust
// Optimized PRAGMA settings
PRAGMA journal_mode = WAL;        // Write-Ahead Logging
PRAGMA synchronous = NORMAL;      // Balance safety/speed
PRAGMA foreign_keys = ON;         // Referential integrity
PRAGMA cache_size = -64000;       // 64MB cache
PRAGMA busy_timeout = 5000;       // 5s timeout
```

**Schema Design:**

```sql
-- Conversations and messages
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- AGI goals and tasks
CREATE TABLE agi_goals (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE TABLE agi_tasks (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    dependencies TEXT,  -- JSON array
    FOREIGN KEY (goal_id) REFERENCES agi_goals(id) ON DELETE CASCADE
);

-- Undo action history
CREATE TABLE undo_actions (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    action_type TEXT NOT NULL,
    before_state TEXT NOT NULL,  -- JSON snapshot
    after_state TEXT NOT NULL,   -- JSON snapshot
    created_at INTEGER NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES agi_goals(id) ON DELETE SET NULL
);

-- Settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## Intelligent Model Router

AGI Workforce v1.0.6 introduces an intelligent model routing system that automatically selects the optimal LLM based on task characteristics, user tier, and cost efficiency.

### Auto Mode Architecture

```
User Message
     |
     v
Task Classification (Local Keywords + LLM Fallback)
     |
     v
Capability Filtering (vision, tools, thinking, agentic)
     |
     v
Benchmark Scoring (SWE-bench, GPQA, MMLU, AIME)
     |
     v
Cost Optimization (by auto mode tier)
     |
     v
Model Selection
```

### Task Types

The router classifies messages into five task types:

| Task Type    | Description                         | Key Benchmarks              |
| ------------ | ----------------------------------- | --------------------------- |
| `coding`     | Writing, debugging, reviewing code  | SWE-bench, HumanEval        |
| `reasoning`  | Complex analysis, math, logic       | GPQA, AIME                  |
| `general`    | Questions, explanations, writing    | MMLU                        |
| `agentic`    | Web browsing, tool use, automation  | SWE-bench + tool capability |
| `multimodal` | Images, screenshots, visual content | MMLU + vision capability    |

### Auto Mode Tiers

```typescript
// Model pools by auto mode (from modelRouter.ts)
const MODEL_POOLS: Record<AutoMode, string[]> = {
  'auto-economy': [
    'gemini-3-flash', // $0.08/$0.30 - Best value multimodal
    'gpt-4o-mini', // $0.15/$0.60 - Good general purpose
    'grok-4-fast', // $0.20/$0.50 - Fast, no vision
    'deepseek-v3.2', // $0.27/$1.10 - Excellent coding
    'qwen-3', // $0.40/$1.20 - Good reasoning
  ],
  'auto-balanced': [
    'deepseek-v3.2', // Best value coding
    'gemini-3-pro', // Excellent all-around
    'gpt-4o', // Good multimodal
    'claude-sonnet-4.5', // Computer use capable
    'grok-4.1', // Strong reasoning
  ],
  'auto-premium': [
    'claude-opus-4.5', // Best coding
    'gpt-5.2', // Best agentic
    'gemini-3-pro', // 2M context
    'claude-sonnet-4.5', // Computer use
    'grok-4.1', // Strong reasoning
  ],
};
```

### Capability-Based Filtering

The router enforces hard requirements based on task type:

```typescript
function hasRequiredCapabilities(model: ModelMetadata, taskType: TaskType): boolean {
  switch (taskType) {
    case 'multimodal':
      // HARD REQUIREMENT: Must support vision
      return model.capabilities.vision === true;

    case 'agentic':
      // HARD REQUIREMENT: Must support tools and agentic workflows
      return model.capabilities.tools === true && model.capabilities.agentic === true;

    case 'coding':
      // SOFT: Tools help but not strictly required
      return model.capabilities.tools === true;

    case 'reasoning':
    case 'general':
      return true;
  }
}
```

### Model Metadata Structure

```typescript
interface ModelMetadata {
  id: string;
  apiModelId: string;
  name: string;
  provider: Provider;
  modelType: 'chat' | 'code' | 'reasoning' | 'multimodal';
  contextWindow: number;
  inputCost: number; // Per 1M tokens
  outputCost: number; // Per 1M tokens
  capabilities: {
    vision: boolean;
    tools: boolean;
    thinking: boolean;
    computerUse: boolean;
    agentic: boolean;
    codeExecution: boolean;
  };
  benchmarks: {
    swebench?: number; // Coding (0-100)
    humaneval?: number; // Code generation
    gpqa?: number; // Graduate reasoning
    mmlu?: number; // General knowledge
    aime?: number; // Math reasoning
  };
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'excellent' | 'good' | 'fair';
}
```

### Manual Model Override

Users can bypass auto-routing by selecting a specific model from QuickModelSelector:

```typescript
function getModelForRequest(
  selectedModel: string,
  message: string,
  hasImages: boolean,
): { modelId: string; reason: string; wasRouted: boolean } {
  // Manual selection bypasses routing
  if (isManualSelection(selectedModel)) {
    return {
      modelId: selectedModel,
      reason: `Manual selection: ${MODEL_METADATA[selectedModel]?.name}`,
      wasRouted: false,
    };
  }

  // Auto mode performs intelligent routing
  if (selectedModel.startsWith('auto-')) {
    const result = routeMessage(message, selectedModel as AutoMode, hasImages);
    return {
      modelId: result.selectedModel,
      reason: result.reason,
      wasRouted: true,
    };
  }
}
```

## Web Application Architecture

### Next.js 16 Architecture

The web app uses Next.js 16 with React 19 Server Components. Its primary role is billing, subscription management, and device sync (not AGI capabilities).

```
apps/web/
  app/                          # App Router
    (auth)/                     # Auth routes (grouped)
      login/
      signup/
    (dashboard)/                # Protected routes
      settings/
      billing/
      devices/
    api/                        # API Routes
      checkout/                 # Stripe checkout
      webhook/                  # Stripe webhooks
      link-device/              # Device pairing
    layout.tsx                  # Root layout
    page.tsx                    # Landing page

  lib/                          # Business logic
    services/                   # Service layer
      subscription.ts           # Subscription management
      credit.ts                 # Credit system
      audit.ts                  # Audit logging
    supabase/                   # Supabase utilities
      client.ts                 # Client initialization
      server.ts                 # Server-side client
    rate-limit.ts               # Rate limiting
    price-tier-mapping.ts       # Stripe price mapping
```

### Server Components Pattern

```tsx
// Server Component (default in app/)
export default async function Page() {
  // Direct database queries
  const data = await fetchDataFromDB();

  return (
    <div>
      <ServerData data={data} />
      <ClientComponent />
    </div>
  );
}

// Client Component
('use client');
export function ClientComponent() {
  const [state, setState] = useState();
  // Client-side interactivity
  return <div>...</div>;
}
```

### Supabase Integration

#### Row Level Security (RLS)

All tables have RLS policies:

```sql
-- Users can only access their own data
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Service role has full access
CREATE POLICY "Service role full access"
ON profiles FOR ALL
USING (auth.jwt()->>'role' = 'service_role');
```

### Stripe Integration Architecture

#### Payment Flow

```
User Checkout
     |
     v
Create Checkout Session
(with metadata: supabase_user_id)
     |
     v
Redirect to Stripe
     |
     v
Payment Success
     |
     v
Webhook Event
(checkout.session.completed)
     |
     v
Process Event Idempotently
(processed_stripe_events table)
     |
     v
Update Subscription
(via service role client)
     |
     v
Sync to Desktop
(via WebSocket)
```

#### Webhook Idempotency

```typescript
// Idempotent webhook processing
export async function processStripeWebhook(event: Stripe.Event) {
  const supabase = createServiceRoleClient();

  // Use database function for idempotency
  const { data, error } = await supabase.rpc('process_stripe_event_idempotent', {
    event_id: event.id,
    event_type: event.type,
    event_data: event.data.object,
  });

  if (error?.message?.includes('duplicate')) {
    // Event already processed
    return { processed: false, reason: 'duplicate' };
  }

  // Process the event
  await handleEventType(event);

  return { processed: true };
}
```

## Backend Services Architecture

### API Gateway (Express)

```typescript
// Server setup
const app = express();

// Middleware stack
app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // CORS
app.use(express.json()); // JSON parsing
app.use(rateLimit); // Rate limiting
app.use(authenticate); // JWT auth

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/mobile', mobileRoutes);

// Error handling
app.use(errorHandler);
```

### WebSocket Signaling Server

Device pairing and real-time sync:

```typescript
const wss = new WebSocketServer({ port: 4000 });

wss.on('connection', (ws, req) => {
  // Connection state
  const client = {
    id: generateId(),
    deviceType: null,
    pairingCode: null,
  };

  ws.on('message', (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'pair-device':
        handlePairing(client, message);
        break;
      case 'sync-state':
        broadcastToDevices(client, message);
        break;
    }
  });
});
```

## Data Flow Patterns

### Tauri Communication Pattern

```typescript
// Frontend invokes Rust command
const result = await invoke<ResultType>('command_name', {
  param1: value1,
  param2: value2,
});

// Backend emits event
state.app_handle.emit_all('event-name', payload)?;

// Frontend listens for events
const unlisten = await listen<PayloadType>('event-name', (event) => {
  console.log('Event received:', event.payload);
});

// Cleanup
unlisten();
```

### State Synchronization Flow

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
Signaling Server
     |
     v
Other Devices
     |
     v
Update Remote State
```

## Security Architecture

### Encryption

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};

pub fn encrypt_data(data: &[u8], key: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&generate_nonce());

    let ciphertext = cipher.encrypt(nonce, data)
        .map_err(|e| anyhow!("Encryption failed: {}", e))?;

    // Prepend nonce to ciphertext
    let mut result = nonce.to_vec();
    result.extend(ciphertext);

    Ok(result)
}
```

### OS Keyring Integration

```rust
// Store credential
pub fn store_credential(service: &str, username: &str, password: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        // Use macOS Keychain
        use security_framework::passwords::*;
        set_generic_password(service, username, password.as_bytes())?;
    }

    #[cfg(target_os = "windows")]
    {
        // Use Windows Credential Manager
        use windows::Security::Credentials::*;
        // Implementation
    }

    Ok(())
}
```

### Audit Logging

```typescript
export async function auditLog(action: string, userId: string, metadata: Record<string, any>) {
  const supabase = createServiceRoleClient();

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    metadata,
    ip_address: getClientIP(),
    user_agent: getUserAgent(),
    timestamp: new Date().toISOString(),
  });
}
```

## AGI System Design

### Architecture Overview

The AGI operates with **full autonomy** - it completes goals without asking for approval at each step. Safety comes from **reversibility**, not permission prompts.

```
                    AGI Core

  Planner  ---->  Executor  ---->  Reflection
       |              |                |
       v              v                v
         Context Manager
                      |
                      v
                  Tool Ecosystem
  File Ops | Shell | Browser | MCP Tools | Code Gen
                      |
                      v
               Undo Action Log
```

### Reasoning Loop

```rust
pub async fn execute_goal(&self, goal: Goal) -> Result<GoalResult> {
    let mut iterations = 0;
    let start_time = Instant::now();
    let mut consecutive_failures = 0;

    loop {
        // Safety limits
        if iterations >= MAX_ITERATIONS {
            emit_event("agi:goal:max_iterations")?;
            break;
        }

        if start_time.elapsed() > Duration::from_secs(300) {
            emit_event("agi:goal:timeout")?;
            break;
        }

        if consecutive_failures >= 3 {
            return Err(anyhow!("Too many consecutive failures"));
        }

        // Planning phase
        let plan = self.planner.create_plan(&goal).await?;

        // Execution phase (with undo logging)
        match self.executor.execute_plan_with_undo(&plan).await {
            Ok(result) => {
                consecutive_failures = 0;

                // Reflection phase
                self.reflection.learn_from_outcome(&result).await?;

                if result.goal_achieved {
                    return Ok(result);
                }
            }
            Err(e) => {
                consecutive_failures += 1;
                // Adapt strategy
                self.context.update_with_error(&e).await?;
            }
        }

        iterations += 1;
    }

    Ok(GoalResult::timeout())
}
```

### Safety Limits

| Limit                | Value            | Event                     |
| -------------------- | ---------------- | ------------------------- |
| Max iterations       | 1000             | `agi:goal:max_iterations` |
| Absolute timeout     | 5 minutes (300s) | `agi:goal:timeout`        |
| Consecutive failures | 3                | Goal abandonment          |

## Undo System Architecture

The undo system is **critical** to enabling full autonomy. Every action the AGI takes must be reversible.

### Undo Action Types

```typescript
type UndoableAction =
  | { type: 'file_edit'; path: string; before: string; after: string }
  | { type: 'file_create'; path: string; content: string }
  | { type: 'file_delete'; path: string; content: string }
  | { type: 'terminal_command'; command: string; output: string }
  | { type: 'browser_navigation'; from: string; to: string }
  | { type: 'setting_change'; key: string; before: any; after: any };
```

### Reversibility Matrix

| Action Type        | Reversible | Undo Method              |
| ------------------ | ---------- | ------------------------ |
| File edit          | Yes        | Restore original content |
| File create        | Yes        | Delete file              |
| File delete        | Yes        | Restore from snapshot    |
| Terminal command   | Partial    | Depends on command       |
| Browser navigation | Yes        | Navigate back            |
| Form submission    | No         | Requires confirmation    |
| Email send         | No         | Requires confirmation    |

### Undo Flow

```
User: "undo that"
     |
     v
Parse intent (undo last / undo specific)
     |
     v
Fetch action from undo_actions table
     |
     v
Apply rollback (before_state)
     |
     v
Update UI to reflect restored state
     |
     v
Confirm: "Reverted file changes to X"
```

### Implementation Pattern

```rust
pub async fn execute_with_undo<T>(
    &self,
    action: impl FnOnce() -> Result<T>,
    undo_action: UndoableAction,
) -> Result<T> {
    // Log before state
    self.undo_log.push(undo_action.clone()).await?;

    // Execute action
    let result = action()?;

    // Action succeeded - undo entry is now valid
    self.undo_log.mark_complete(&undo_action.id).await?;

    Ok(result)
}

pub async fn undo_last(&self) -> Result<()> {
    let action = self.undo_log.pop().await?;

    match action {
        UndoableAction::FileEdit { path, before, .. } => {
            fs::write(&path, before).await?;
        }
        UndoableAction::FileCreate { path, .. } => {
            fs::remove_file(&path).await?;
        }
        // ... other action types
    }

    Ok(())
}
```

## MCP Integration

### Design Philosophy

**MCP is hidden from users.** Users never see "MCP servers" or configure them manually. They simply ask for things ("search my email", "check my calendar") and the system uses MCP tools behind the scenes.

### Registry Architecture

```rust
pub struct MCPRegistry {
    servers: Arc<RwLock<HashMap<String, MCPServer>>>,
    sessions: Arc<RwLock<HashMap<String, MCPSession>>>,
}

impl MCPRegistry {
    pub async fn register_server(&self, config: ServerConfig) -> Result<String> {
        let server = MCPServer::new(config).await?;
        let id = server.id.clone();

        self.servers.write().await.insert(id.clone(), server);

        Ok(id)
    }

    pub async fn discover_tools(&self, server_id: &str) -> Result<Vec<Tool>> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| anyhow!("Server not found"))?;

        let session = server.create_session().await?;
        let tools = session.list_tools().await?;

        Ok(tools)
    }
}
```

### Tool Invocation

```rust
pub async fn invoke_mcp_tool(
    &self,
    tool_id: &str,
    params: Value,
) -> Result<ToolResult> {
    // Parse tool ID: mcp__{server_name}__{tool_name}
    let parts: Vec<&str> = tool_id.split("__").collect();
    if parts.len() != 3 || parts[0] != "mcp" {
        return Err(anyhow!("Invalid MCP tool ID format"));
    }

    let server_name = parts[1];
    let tool_name = parts[2];

    // Get or create session
    let session = self.get_or_create_session(server_name).await?;

    // Invoke tool
    let result = session.call_tool(tool_name, params).await?;

    Ok(result)
}
```

### User-Facing Error Translation

```typescript
// Never show MCP errors to users
function translateMCPError(error: MCPError): string {
  switch (error.code) {
    case 'SERVER_NOT_FOUND':
      return "I couldn't connect to that service. Please try again.";
    case 'AUTH_REQUIRED':
      return 'I need permission to access that. Would you like to sign in?';
    case 'TOOL_FAILED':
      return 'Something went wrong. Let me try a different approach.';
    default:
      return 'I ran into an issue. Let me try again.';
  }
}
```

## Performance Optimization

### Caching Strategy

```rust
pub struct LRUCache<K, V> {
    map: DashMap<K, (V, Instant)>,
    max_size: usize,
    ttl: Duration,
}

impl<K, V> LRUCache<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    pub fn get(&self, key: &K) -> Option<V> {
        self.map.get(key).and_then(|entry| {
            let (value, timestamp) = entry.value();
            if timestamp.elapsed() < self.ttl {
                Some(value.clone())
            } else {
                self.map.remove(key);
                None
            }
        })
    }
}
```

### Parallel Execution

```rust
use rayon::prelude::*;

// Parallel processing
let results: Vec<_> = items
    .par_iter()
    .map(|item| process_item(item))
    .collect();

// Concurrent async operations
let futures: Vec<_> = items
    .iter()
    .map(|item| async_process(item))
    .collect();

let results = futures::future::join_all(futures).await;
```

### Database Optimization

```sql
-- Indexes for common queries
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_agi_tasks_goal ON agi_tasks(goal_id, status);
CREATE INDEX idx_undo_actions_goal ON undo_actions(goal_id, created_at DESC);

-- Analyze for query optimization
ANALYZE;
```

## Deployment Architecture

### Desktop App Distribution

```
         GitHub Releases
  Tauri Updater
  - Version checking
  - Signature verification
  - Background downloads
  - Silent updates
```

### Web App Deployment (Vercel)

```
         Git Repository (main)
               | Push/Merge
               v
         Vercel Build
  1. Install dependencies
  2. Build Next.js app
  3. Deploy to edge
  4. Run migrations (optional)
               |
               v
         Production
  - Global CDN
  - Edge Functions
  - Automatic HTTPS
  - DDoS Protection
```

### Monitoring and Observability

```rust
// Sentry integration
#[cfg(feature = "sentry")]
fn init_sentry() {
    let _guard = sentry::init((
        env::var("SENTRY_DSN").unwrap(),
        sentry::ClientOptions {
            release: Some(env!("CARGO_PKG_VERSION").into()),
            environment: Some(if cfg!(debug_assertions) {
                "development"
            } else {
                "production"
            }.into()),
            ..Default::default()
        },
    ));
}

// Tracing
use tracing::{info, warn, error};

#[instrument]
async fn important_operation(param: &str) -> Result<()> {
    info!("Starting operation with param: {}", param);

    match risky_operation(param).await {
        Ok(result) => {
            info!("Operation completed successfully");
            Ok(result)
        }
        Err(e) => {
            error!("Operation failed: {}", e);
            Err(e)
        }
    }
}
```

## Conclusion

This architecture provides:

- **Simplicity**: Chat-first interface eliminates configuration complexity
- **Autonomy**: AGI completes goals end-to-end without interruption
- **Safety**: Undo system enables reversal of any action
- **Intelligence**: Model router selects optimal LLM for each task
- **Performance**: Native Rust backend, optimized queries, caching
- **Security**: Encryption, authentication, audit logging
- **Reliability**: Error handling, retry logic, idempotency
- **Maintainability**: Modular design, clear separation of concerns

For more details, see:

- [CLAUDE.md](CLAUDE.md) - Development patterns and guidelines
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [docs/README.md](docs/README.md) - Full documentation index
- [docs/CHANGELOG.md](docs/CHANGELOG.md) - Version history
- [docs/features/](docs/features/) - Feature documentation
- [docs/api/](docs/api/) - API reference
