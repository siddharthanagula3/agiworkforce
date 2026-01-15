# AGI Workforce Architecture

This document provides a comprehensive overview of the AGI Workforce system architecture, design patterns, and technical implementation details.

## Table of Contents

- [System Overview](#system-overview)
- [Desktop Application Architecture](#desktop-application-architecture)
- [Web Application Architecture](#web-application-architecture)
- [Backend Services Architecture](#backend-services-architecture)
- [Data Flow Patterns](#data-flow-patterns)
- [Security Architecture](#security-architecture)
- [AGI System Design](#agi-system-design)
- [MCP Integration](#mcp-integration)
- [Performance Optimization](#performance-optimization)
- [Deployment Architecture](#deployment-architecture)

## System Overview

AGI Workforce is built as a multi-tier, distributed system with the following key components:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Tier                                  │
│  ┌──────────────────┐              ┌──────────────────┐             │
│  │  Desktop App     │              │   Web App        │             │
│  │  (Tauri + React) │              │   (Next.js)      │             │
│  └──────────────────┘              └──────────────────┘             │
│         │                                    │                       │
└─────────┼────────────────────────────────────┼───────────────────────┘
          │                                    │
          │ Tauri Commands                     │ HTTP/GraphQL
          │ WebSocket                          │ WebSocket
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Application Tier                                │
│  ┌──────────────────┐              ┌──────────────────┐             │
│  │  Rust Backend    │◄───────────►│  API Gateway     │             │
│  │  (Tokio)         │              │  (Express)       │             │
│  └──────────────────┘              └──────────────────┘             │
│         │                                    │                       │
│         │                          ┌──────────────────┐             │
│         │                          │ Signaling Server │             │
│         │                          │  (WebSocket)     │             │
│         │                          └──────────────────┘             │
└─────────┼────────────────────────────────────┼───────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Tier                                    │
│  ┌──────────────────┐              ┌──────────────────┐             │
│  │  SQLite          │              │  PostgreSQL      │             │
│  │  (Local)         │              │  (Supabase)      │             │
│  └──────────────────┘              └──────────────────┘             │
│                                                                      │
│  ┌──────────────────┐              ┌──────────────────┐             │
│  │  Redis           │              │  S3/Storage      │             │
│  │  (Cache/Queue)   │              │  (Files)         │             │
│  └──────────────────┘              └──────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     External Services                               │
│  OpenAI │ Anthropic │ Google │ Stripe │ Supabase │ MCP Servers     │
└─────────────────────────────────────────────────────────────────────┘
```

## Desktop Application Architecture

### Frontend Architecture (React)

The desktop frontend follows a layered architecture with clear separation of concerns:

```
┌───────────────────────────────────────────────────────────────┐
│                         UI Layer                              │
│  Components (Radix UI) │ Pages │ Layouts                      │
└───────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────┐
│                    State Management Layer                     │
│  Zustand Stores │ React Query │ Local State                   │
└───────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────┐
│                     Communication Layer                       │
│  Tauri Bridge │ Event Listeners │ Command Invocations         │
└───────────────────────────────────────────────────────────────┘
```

#### Zustand State Management

State is organized into domain-specific stores with middleware stack:

```typescript
// Store pattern
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
- `useWorkflowStore` - Automation workflows and executions
- `useAuthStore` - Authentication state and session management

### Backend Architecture (Rust)

The Rust backend is organized into modular layers:

```
apps/desktop/src-tauri/src/
├── sys/                    # System layer
│   ├── commands/          # Tauri command handlers
│   ├── security/          # Security policies and encryption
│   ├── events/            # Event emission and handling
│   └── billing/           # Stripe integration
│
├── core/                  # Business logic layer
│   ├── agi/               # AGI reasoning system
│   │   ├── core.rs        # Main AGI loop
│   │   ├── planner.rs     # Task planning
│   │   ├── executor.rs    # Task execution
│   │   └── reflection.rs  # Learning and reflection
│   ├── agent/             # Agent systems
│   │   ├── autonomous.rs  # Autonomous agent
│   │   ├── planner.rs     # Planning algorithms
│   │   └── code_generator.rs  # Code generation
│   ├── llm/               # LLM integration
│   │   ├── router.rs      # Multi-provider routing
│   │   ├── providers/     # Provider implementations
│   │   └── tool_executor.rs  # Tool/function calling
│   ├── mcp/               # Model Context Protocol
│   │   ├── registry.rs    # Server registry
│   │   ├── manager.rs     # Server lifecycle
│   │   └── session.rs     # Session management
│   └── vision/            # Vision capabilities
│
├── data/                  # Data access layer
│   ├── db/                # SQLite database
│   │   ├── repository.rs  # Data access patterns
│   │   └── migrations.rs  # Schema migrations
│   ├── cache/             # Caching layer
│   └── settings/          # Settings persistence
│
├── automation/            # Automation layer
│   ├── workflow.rs        # Workflow engine
│   ├── vision_planner.rs  # Visual automation
│   └── scheduler.rs       # Task scheduling
│
├── integrations/          # External integrations
│   ├── github.rs          # GitHub API
│   ├── browser.rs         # Browser automation
│   └── terminal.rs        # Terminal integration
│
└── features/              # Feature modules
    ├── terminal/          # Terminal features
    └── tests/             # Test utilities
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

-- Workflows
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    definition TEXT NOT NULL,  -- JSON
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## Web Application Architecture

### Next.js 16 Architecture

The web app uses Next.js 16 with React 19 Server Components:

```
apps/web/
├── app/                          # App Router
│   ├── (auth)/                   # Auth routes (grouped)
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/              # Protected routes
│   │   ├── chat/
│   │   ├── workflows/
│   │   └── settings/
│   ├── api/                      # API Routes
│   │   ├── checkout/             # Stripe checkout
│   │   ├── webhook/              # Stripe webhooks
│   │   └── link-device/          # Device pairing
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page
│
├── lib/                          # Business logic
│   ├── services/                 # Service layer
│   │   ├── subscription.ts       # Subscription management
│   │   ├── credit.ts             # Credit system
│   │   └── audit.ts              # Audit logging
│   ├── supabase/                 # Supabase utilities
│   │   ├── client.ts             # Client initialization
│   │   └── server.ts             # Server-side client
│   ├── rate-limit.ts             # Rate limiting
│   ├── price-tier-mapping.ts     # Stripe price mapping
│   └── utils.ts                  # Shared utilities
│
└── middleware.ts                 # Auth middleware
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

#### Client Initialization

```typescript
// Server-side client
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name, options) => cookieStore.delete(name, options),
      },
    },
  );
}
```

### Stripe Integration Architecture

#### Payment Flow

```
User Checkout
     │
     ▼
Create Checkout Session
(with metadata: supabase_user_id)
     │
     ▼
Redirect to Stripe
     │
     ▼
Payment Success
     │
     ▼
Webhook Event
(checkout.session.completed)
     │
     ▼
Process Event Idempotently
(processed_stripe_events table)
     │
     ▼
Update Subscription
(via service role client)
     │
     ▼
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
     │
     ▼
Update Zustand Store
     │
     ▼
Invoke Tauri Command
     │
     ▼
Update SQLite
     │
     ▼
Emit Tauri Event
     │
     ▼
Send WebSocket Message
     │
     ▼
Signaling Server
     │
     ▼
Other Devices
     │
     ▼
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

```
┌─────────────────────────────────────────────────────────────┐
│                    AGI Core                                 │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ Planner  │───►│ Executor │───►│Reflection│             │
│  └──────────┘    └──────────┘    └──────────┘             │
│       │               │                │                    │
│       ▼               ▼                ▼                    │
│  ┌─────────────────────────────────────────┐               │
│  │         Context Manager                 │               │
│  └─────────────────────────────────────────┘               │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Tool Ecosystem                             │
│  File Ops │ Shell │ Browser │ MCP Tools │ Code Gen          │
└─────────────────────────────────────────────────────────────┘
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

        // Execution phase
        match self.executor.execute_plan(&plan).await {
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

### Process Reasoning

```rust
pub struct ProcessNode {
    pub id: String,
    pub action: Action,
    pub dependencies: Vec<String>,
    pub parallel_group: Option<String>,
}

pub async fn reason_process(&self, goal: &str) -> Result<ProcessDAG> {
    // Use LLM to decompose goal into DAG
    let response = self.llm.chat(ChatRequest {
        messages: vec![
            Message::system(PROCESS_REASONING_PROMPT),
            Message::user(goal),
        ],
        tools: Some(vec![process_reasoning_tool()]),
        ...
    }).await?;

    // Extract structured process
    let process = parse_process_from_response(response)?;

    // Validate DAG (no cycles)
    validate_dag(&process)?;

    Ok(process)
}
```

## MCP Integration

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
CREATE INDEX idx_workflows_updated ON workflows(updated_at DESC);

-- Analyze for query optimization
ANALYZE;
```

## Deployment Architecture

### Desktop App Distribution

```
┌─────────────────────────────────────────┐
│         GitHub Releases                 │
│  ┌───────────────────────────────────┐  │
│  │  Tauri Updater                    │  │
│  │  - Version checking               │  │
│  │  - Signature verification         │  │
│  │  - Background downloads           │  │
│  │  - Silent updates                 │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Web App Deployment (Vercel)

```
┌─────────────────────────────────────────┐
│         Git Repository (main)           │
└──────────────┬──────────────────────────┘
               │ Push/Merge
               ▼
┌─────────────────────────────────────────┐
│         Vercel Build                    │
│  ┌───────────────────────────────────┐  │
│  │  1. Install dependencies          │  │
│  │  2. Build Next.js app             │  │
│  │  3. Deploy to edge                │  │
│  │  4. Run migrations (optional)     │  │
│  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Production                      │
│  - Global CDN                           │
│  - Edge Functions                       │
│  - Automatic HTTPS                      │
│  - DDoS Protection                      │
└─────────────────────────────────────────┘
```

### Monitoring & Observability

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

- **Scalability**: Horizontal scaling of backend services
- **Performance**: Native Rust backend, optimized queries, caching
- **Security**: Encryption, authentication, audit logging
- **Reliability**: Error handling, retry logic, idempotency
- **Maintainability**: Modular design, clear separation of concerns
- **Observability**: Logging, tracing, monitoring

For more details, see:

- [CLAUDE.md](CLAUDE.md) - Development patterns and guidelines
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [docs/](docs/) - Additional technical documentation
