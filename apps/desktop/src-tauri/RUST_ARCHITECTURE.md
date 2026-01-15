# Rust Backend Architecture

> Comprehensive guide to the AGI Workforce Rust backend built with Tauri 2.9 and Rust 2021 edition

## Table of Contents

- [Overview](#overview)
- [Architecture Principles](#architecture-principles)
- [Module Structure](#module-structure)
- [Data Flow](#data-flow)
- [State Management](#state-management)
- [Error Handling](#error-handling)
- [Security Model](#security-model)
- [Performance Patterns](#performance-patterns)

## Overview

The AGI Workforce desktop application is a sophisticated Tauri-based system that combines a Rust backend with a React frontend. The Rust backend provides:

- **System Integration**: Native OS capabilities (filesystem, clipboard, keyboard, automation)
- **AI Orchestration**: LLM routing, AGI reasoning, autonomous agents
- **Data Persistence**: SQLite for local storage with WAL mode for concurrency
- **Security**: Encryption, authentication, approval workflows, audit logging
- **Real-time Communication**: WebSocket servers, event streaming
- **Third-party Integrations**: MCP servers, cloud storage, productivity tools

### Technology Stack

- **Rust**: 2021 edition with strict lints (unsafe code warnings, deny unused)
- **Async Runtime**: Tokio with full features
- **Database**: SQLite with rusqlite (bundled) and tokio-rusqlite for async
- **Serialization**: Serde with JSON and bincode
- **Networking**: Reqwest with rustls-tls, retry middleware
- **Cryptography**: AES-GCM, Argon2, PBKDF2, HMAC
- **Concurrency**: Rayon for parallelism, DashMap for concurrent maps, parking_lot for fast locks

## Architecture Principles

### 1. Modular Design

The codebase follows a clear separation of concerns across six top-level modules:

- **core**: Business logic, AI systems, orchestration
- **sys**: System commands, security, telemetry
- **data**: Persistence, caching, analytics
- **automation**: UI automation, browser control, screen capture
- **integrations**: Third-party APIs, real-time sync
- **features**: High-level features (terminal, documents, teams)
- **ui**: UI-related Rust code (tray, window management)

### 2. Tauri Command Pattern

All frontend-to-backend communication uses Tauri commands:

```rust
#[tauri::command]
async fn my_command(
    state: State<'_, MyStateWrapper>,
    param: String,
) -> Result<MyResult, String> {
    // Implementation
}
```

Commands are:
- Async by default (using Tokio)
- Return `Result<T, String>` for consistent error handling
- Accept `State<'_, Wrapper>` for dependency injection
- Registered in `lib.rs` via `invoke_handler!`

### 3. State Management

State is managed through Tauri's managed state system:

```rust
// Definition
pub struct MyStateWrapper(Arc<Mutex<MyState>>);

// Registration in lib.rs setup()
app.manage(MyStateWrapper::new());

// Access in commands
#[tauri::command]
async fn use_state(state: State<'_, MyStateWrapper>) -> Result<(), String> {
    let data = state.0.lock().await;
    // Use data
    Ok(())
}
```

**Key State Wrappers**:
- `AppDatabase`: SQLite connection pool
- `LLMState`: LLM router and provider configurations
- `McpState`: MCP server registry and connections
- `BrowserStateWrapper`: Browser automation state
- `AuthManagerState`: Authentication and session management

### 4. Error Handling Strategy

The codebase uses a layered error handling approach:

**Internal Errors** (within modules):
```rust
use anyhow::{Context, Result};

fn internal_function() -> Result<T> {
    do_something().context("Failed to do something")?;
    Ok(result)
}
```

**Command Errors** (exposed to frontend):
```rust
#[tauri::command]
async fn public_command() -> Result<T, String> {
    internal_function()
        .map_err(|e| format!("Command failed: {}", e))?;
    Ok(result)
}
```

**Custom Errors** (domain-specific):
```rust
#[derive(Debug, thiserror::Error)]
pub enum MyError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}
```

### 5. Async Patterns

The backend extensively uses async/await with Tokio:

**Spawning Tasks**:
```rust
use tauri::async_runtime;

async_runtime::spawn(async move {
    // Background task
});
```

**Async Locks**:
```rust
use tokio::sync::Mutex;

let data = state.lock().await;
// Async work
drop(data); // Explicit unlock
```

**Channels for Communication**:
```rust
let (tx, mut rx) = tokio::sync::mpsc::channel(100);

// Producer
tx.send(message).await?;

// Consumer
while let Some(msg) = rx.recv().await {
    // Process
}
```

## Module Structure

### Core (`src/core/`)

Business logic and AI systems.

#### `core/agent/`
Autonomous agent infrastructure:
- `ai_orchestrator.rs`: Coordinates multiple AI agents
- `approval.rs`: Human-in-the-loop approval system
- `executor.rs`: Executes agent actions
- `planner.rs`: Creates execution plans
- `rag_system.rs`: Retrieval-Augmented Generation

#### `core/agi/`
AGI (Artificial General Intelligence) reasoning system:
- `core.rs`: Core AGI logic with goal processing
- `orchestrator.rs`: Multi-agent orchestration
- `planner.rs`: High-level planning with sub-goal decomposition
- `executor.rs`: Executes plans with resource management
- `reflection.rs`: Self-reflection and learning from failures
- `memory.rs`: Working memory and context management
- `knowledge.rs`: Long-term knowledge storage
- `learning.rs`: Continuous learning from outcomes
- `tools.rs`: Tool registry and execution

**Key Features**:
- Goal-oriented reasoning with priority handling
- Automatic sub-goal decomposition
- Resource-aware execution (CPU, memory, network limits)
- Failure analysis and correction suggestions
- Safety limits: 1000 iterations, 5-minute timeout, 3 consecutive failures

#### `core/llm/`
LLM router and provider management:
- `llm_router.rs`: Routes requests to optimal provider
- `providers/`: Anthropic, OpenAI, Google, DeepSeek, Ollama, etc.
- `cost_calculator.rs`: Cost tracking and optimization
- `token_counter.rs`: Token counting for context management

**Provider System**:
- Unified interface for all LLM providers
- Automatic fallback on provider failure
- Cost optimization based on task requirements
- Streaming support with SSE parsing

#### `core/mcp/`
Model Context Protocol integration:
- `registry.rs`: MCP server discovery and management
- `protocol.rs`: MCP protocol implementation
- `health.rs`: Server health monitoring
- `events.rs`: Event emission for server lifecycle

#### `core/embeddings/`
Vector embeddings for semantic search:
- `generator.rs`: Generate embeddings from text
- `cache.rs`: Cache embeddings for performance
- `chunker.rs`: Intelligent text chunking
- `indexer.rs`: Build and query vector indices

### System (`src/sys/`)

System-level functionality and commands.

#### `sys/commands/`
All Tauri commands organized by domain:
- `agent.rs`: Agent lifecycle commands
- `agi.rs`: AGI reasoning commands
- `chat/`: Chat and conversation commands
- `llm.rs`: LLM provider commands
- `file_ops.rs`: File system operations
- `terminal.rs`: Terminal session management
- `automation.rs`: UI automation commands
- `browser.rs`: Browser automation
- `git.rs`: Git operations
- `mcp.rs`: MCP server management
- Plus 40+ other command modules

**Command Organization**:
Each command module follows this pattern:
```rust
// State wrapper
pub struct MyState(Arc<Mutex<MyData>>);

impl MyState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(MyData::default())))
    }
}

// Commands
#[tauri::command]
pub async fn my_command(
    state: State<'_, MyState>,
    param: String,
) -> Result<MyResponse, String> {
    // Implementation
}
```

#### `sys/security/`
Comprehensive security system:
- `auth.rs`: Authentication manager
- `secret_manager.rs`: Secure secret storage using machine-derived keys
- `encryption.rs`: AES-GCM encryption
- `policy/`: Policy engine for access control
- `approval_workflow.rs`: Approval workflows for risky operations
- `audit_logger.rs`: Tamper-proof audit logging
- `guardrails.rs`: LLM output validation
- `prompt_injection.rs`: Prompt injection detection
- `rate_limit.rs`: Rate limiting for API calls
- `rbac.rs`: Role-based access control

**Security Architecture**:
- Machine-derived keys (no keyring dependency)
- SQLite-based encrypted storage
- Policy-based access control
- Audit trail with integrity verification
- Risk level calculation (Low, Medium, High, Critical)

#### `sys/telemetry/`
Analytics and monitoring:
- `collector.rs`: Collect usage telemetry
- `metrics.rs`: System and app metrics
- `logging.rs`: Structured logging with tracing
- `analytics_metrics.rs`: Feature usage analytics

### Data (`src/data/`)

Data persistence and caching.

#### `data/db/`
Database layer:
- `migrations.rs`: Schema migrations with version tracking
- `repository.rs`: Data access layer with prepared statements

**Migration System**:
```rust
// Migrations run on startup
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version = get_current_version(conn)?;

    for migration in &MIGRATIONS[version as usize..] {
        migration.execute(conn)?;
        update_version(conn, migration.version)?;
    }

    Ok(())
}
```

**Current Schema Version**: 45

**Key Tables**:
- `conversations`, `messages`: Chat history
- `settings_v2`: Key-value settings store
- `audit_events`: Security audit log
- `approval_requests`: Pending approvals
- `mcp_servers`, `mcp_tools_cache`: MCP registry
- `workflow_definitions`, `workflow_executions`: Workflow engine
- `codebase_cache`: File tree and symbol cache
- Plus 100+ other tables

#### `data/cache/`
Intelligent caching:
- `codebase.rs`: File tree and symbol caching
- `llm_responses.rs`: LLM response caching (future)
- `tool_results.rs`: Tool result caching (future)
- `watcher_integration.rs`: Invalidate cache on file changes

#### `data/analytics/`
ROI and usage analytics:
- `roi_calculator.rs`: Calculate time/cost savings
- `metrics_aggregator.rs`: Aggregate metrics over time
- `report_generator.rs`: Generate periodic reports

#### `data/settings/`
Settings management:
- Hierarchical settings with categories
- Atomic get/set operations
- Batch operations for performance

### Automation (`src/automation/`)

UI and browser automation.

#### `automation/screen/`
Screen capture and analysis:
- Uses `xcap` crate with lock file to prevent concurrent access
- Full screen, region, and window capture
- Screenshot history with metadata

#### `automation/browser/`
Browser automation with Playwright/CDP:
- `mod.rs`: High-level browser controller
- `dom_operations.rs`: DOM manipulation
- `semantic.rs`: Semantic element finding (by role, label, text)

**Browser Features**:
- Multi-tab management
- Semantic selectors (find by "Submit button")
- JavaScript execution
- Network interception
- Performance metrics

### Integrations (`src/integrations/`)

Third-party service integrations.

#### `integrations/realtime/`
Real-time collaboration:
- `websocket_server.rs`: WebSocket server on port 8787
- `presence.rs`: User presence management
- `collaboration.rs`: Real-time state sync
- `events.rs`: Event broadcasting

#### `integrations/sync/`
Cloud synchronization (future):
- Desktop-to-web sync
- Conflict resolution
- Offline queue

### Features (`src/features/`)

High-level application features.

#### `features/terminal/`
Integrated terminal:
- `mod.rs`: Session manager with PTY
- `ai_assistant.rs`: AI-powered command suggestions and error explanations
- Shell detection (bash, zsh, fish, PowerShell, cmd)
- Command history
- Smart commit messages

#### `features/document/`
Document processing:
- PDF: Read with `pdf-extract`, create with `printpdf`
- Word: Read/write with `docx-rs`
- Excel: Read with `calamine`, write with `rust_xlsxwriter`

#### `features/tasks/`
Background task management:
- `executor.rs`: Task executor with concurrency limits
- `queue.rs`: Priority queue
- `persistence.rs`: Save/restore tasks across restarts
- `types.rs`: Task definitions

#### `features/teams/`
Team collaboration:
- Team management
- Member roles and permissions
- Resource sharing
- Activity tracking
- Team billing

### UI (`src/ui/`)

UI-related Rust code.

#### `ui/window.rs`
Window management:
- Floating window support
- Dock/undock with position memory
- Always-on-top mode
- Fullscreen toggle
- Multi-monitor support

#### `ui/tray.rs`
System tray:
- Tray icon with badge support
- Context menu
- Quick actions
- Unread indicator

## Data Flow

### Typical Request Flow

1. **Frontend Invocation**:
```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('my_command', { param: 'value' });
```

2. **Command Handler**:
```rust
#[tauri::command]
async fn my_command(
    db: State<'_, AppDatabase>,
    param: String,
) -> Result<MyResponse, String> {
    // Parse input
    // Validate
    // Access database
    // Process
    // Return result
}
```

3. **Database Access**:
```rust
let conn = db.conn.lock()
    .map_err(|e| format!("Lock error: {}", e))?;

conn.execute("INSERT INTO ...", params)?;
```

4. **Event Emission** (if needed):
```rust
use tauri::Manager;

app.emit("my-event", payload)?;
```

5. **Frontend Reception**:
```typescript
import { listen } from '@tauri-apps/api/event';

await listen('my-event', (event) => {
  // Handle event
});
```

### AGI Execution Flow

1. **Goal Submission**: `agi_submit_goal` command
2. **Planning**: AGIPlanner creates execution plan with sub-goals
3. **Reflection**: ReflectionEngine assesses plan for risks
4. **Execution**: AGIExecutor runs steps with resource tracking
5. **Tool Calling**: Tools execute with approval checks if needed
6. **Learning**: LearningSystem updates knowledge from outcomes
7. **Completion**: Results returned, events emitted

### MCP Tool Flow

1. **Server Discovery**: `mcp_initialize` scans config
2. **Connection**: `mcp_connect_server` starts server process
3. **Tool Discovery**: Server announces available tools
4. **Registry Update**: Tools added to global registry
5. **Tool Invocation**: `mcp_call_tool` with credentials
6. **Result Caching**: Cache results for repeated calls

## State Management

### Managed State Types

**Synchronous State** (parking_lot::Mutex):
```rust
pub struct SyncState(Arc<Mutex<Data>>);

// Fast, non-async access
let data = state.0.lock();
```

**Asynchronous State** (tokio::sync::Mutex):
```rust
pub struct AsyncState(Arc<TokioMutex<Data>>);

// Async access, can hold across await
let data = state.0.lock().await;
```

**Arc for Shared Ownership**:
```rust
pub struct SharedState(Arc<ServiceImplementation>);

// Multiple owners, immutable or internal mutability
let service = state.0.clone();
```

### State Initialization

All state is initialized in `lib.rs` `setup()`:

```rust
.setup(|app| {
    // Database
    let conn = Connection::open(&db_path)?;
    app.manage(AppDatabase { conn: Arc::new(Mutex::new(conn)) });

    // Services
    app.manage(LLMState::new());
    app.manage(McpState::new());

    // Complex state with dependencies
    let auth = Arc::new(AuthManager::new(secret_manager));
    app.manage(AuthManagerState(auth));

    Ok(())
})
```

### State Access Patterns

**Read-only Access**:
```rust
#[tauri::command]
async fn read_state(state: State<'_, MyState>) -> Result<Data, String> {
    let data = state.0.lock().await;
    Ok(data.clone())
}
```

**Mutable Access**:
```rust
#[tauri::command]
async fn update_state(
    state: State<'_, MyState>,
    value: String,
) -> Result<(), String> {
    let mut data = state.0.lock().await;
    data.update(value);
    Ok(())
}
```

**Long-running Operations**:
```rust
#[tauri::command]
async fn background_work(state: State<'_, MyState>) -> Result<(), String> {
    let state_clone = state.0.clone();

    tauri::async_runtime::spawn(async move {
        let data = state_clone.lock().await;
        // Work
    });

    Ok(())
}
```

## Error Handling

### Error Types

**anyhow::Result**: Internal functions
- Flexible error handling
- Context chaining
- Automatic conversions

**Result<T, String>**: Tauri commands
- Frontend-friendly error messages
- Serializable errors
- Consistent format

**thiserror::Error**: Custom errors
- Type-safe error handling
- Automatic Display implementation
- Error source tracking

### Error Patterns

**Context Addition**:
```rust
use anyhow::Context;

fn load_config() -> Result<Config> {
    let data = read_file("config.json")
        .context("Failed to read config file")?;

    serde_json::from_str(&data)
        .context("Failed to parse config JSON")?
}
```

**Error Mapping**:
```rust
#[tauri::command]
async fn command() -> Result<T, String> {
    internal_function()
        .map_err(|e| format!("Operation failed: {:#}", e))?;
    Ok(result)
}
```

**Error Recovery**:
```rust
match risky_operation() {
    Ok(result) => Ok(result),
    Err(e) => {
        tracing::warn!("Operation failed: {}, using fallback", e);
        Ok(fallback_value())
    }
}
```

### Logging Errors

```rust
use tracing::{error, warn, info};

// Critical errors
error!("Database connection failed: {}", e);

// Recoverable issues
warn!("Cache miss for key {}, fetching from source", key);

// Informational
info!("MCP server connected: {}", server_name);
```

## Security Model

### Multi-layered Security

1. **Policy Engine**: Access control based on context
2. **Approval Workflows**: Human-in-the-loop for risky operations
3. **Audit Logging**: Tamper-proof event log
4. **Secret Management**: Encrypted credential storage
5. **Prompt Injection Detection**: LLM safety
6. **Rate Limiting**: Prevent abuse
7. **RBAC**: Role-based permissions

### Policy Engine

```rust
use crate::sys::security::{PolicyEngine, PolicyContext, ActionCategory};

let engine = PolicyEngine::new();

let context = PolicyContext {
    action: ActionCategory::FileRead,
    target: "/etc/passwd".to_string(),
    user: "user123".to_string(),
    workspace: None,
    request_origin: "ai_agent".to_string(),
};

match engine.evaluate(&context) {
    PolicyDecision::Allow => {
        // Proceed
    },
    PolicyDecision::Deny { reason } => {
        return Err(format!("Access denied: {}", reason));
    },
    PolicyDecision::RequestApproval { risk_level } => {
        // Create approval request
    },
}
```

### Approval Workflows

```rust
use crate::sys::security::ApprovalWorkflow;

let workflow = ApprovalWorkflow::new(db_path);

// Check if approval needed
if workflow.requires_approval(&action, &context)? {
    let request_id = workflow.create_approval_request(
        user_id,
        action,
        context,
        risk_level,
    ).await?;

    // Wait for approval (or timeout)
    // Frontend shows approval UI
}
```

### Audit Logging

```rust
use crate::sys::security::EnhancedAuditLogger;

let logger = EnhancedAuditLogger::new(conn);

logger.log_tool_execution(
    user_id,
    tool_name,
    params,
    result,
    success,
).await?;

// Verify log integrity
let report = logger.verify_integrity().await?;
```

### Secret Management

```rust
use crate::sys::security::SecretManager;

let manager = SecretManager::new(db_conn);

// Store secret (encrypted with machine key)
manager.set("service", "api_key", "secret_value").await?;

// Retrieve secret
let value = manager.get("service", "api_key").await?;

// Delete secret
manager.delete("service", "api_key").await?;
```

Machine-derived key ensures secrets are only accessible on the same machine.

## Performance Patterns

### Concurrency

**Rayon for CPU-bound Work**:
```rust
use rayon::prelude::*;

let results: Vec<_> = items
    .par_iter()
    .map(|item| process(item))
    .collect();
```

**Tokio for I/O-bound Work**:
```rust
let futures = items.iter().map(|item| async move {
    fetch_data(item).await
});

let results = futures::future::join_all(futures).await;
```

**DashMap for Concurrent Map**:
```rust
use dashmap::DashMap;

let map: DashMap<String, Value> = DashMap::new();

// Lock-free reads/writes
map.insert(key, value);
let value = map.get(&key);
```

### Caching

**LRU Cache Pattern**:
```rust
use std::collections::HashMap;

struct Cache {
    data: HashMap<String, (Value, Instant)>,
    ttl: Duration,
}

impl Cache {
    fn get(&mut self, key: &str) -> Option<Value> {
        self.data.get(key).and_then(|(value, timestamp)| {
            if timestamp.elapsed() < self.ttl {
                Some(value.clone())
            } else {
                self.data.remove(key);
                None
            }
        })
    }
}
```

**Database Query Cache**:
```rust
// Cache parsed file trees
let cached = codebase_cache.get_file_tree(project_id)?;
if let Some(tree) = cached {
    return Ok(tree);
}

let tree = parse_file_tree()?;
codebase_cache.set_file_tree(project_id, &tree)?;
```

### Database Optimization

**SQLite Pragmas** (set in `lib.rs`):
```sql
PRAGMA busy_timeout = 5000;      -- Wait up to 5s for locks
PRAGMA journal_mode = WAL;        -- Write-Ahead Logging
PRAGMA synchronous = NORMAL;      -- Balanced safety/speed
PRAGMA foreign_keys = ON;         -- Referential integrity
PRAGMA cache_size = -64000;       -- 64MB cache
```

**Prepared Statements**:
```rust
let mut stmt = conn.prepare_cached(
    "SELECT * FROM users WHERE id = ?1"
)?;

let user = stmt.query_row([user_id], |row| {
    Ok(User {
        id: row.get(0)?,
        name: row.get(1)?,
    })
})?;
```

**Batch Operations**:
```rust
let tx = conn.transaction()?;

for item in items {
    tx.execute("INSERT INTO ...", params)?;
}

tx.commit()?;
```

### Memory Management

**Streaming Large Data**:
```rust
use tokio::io::AsyncReadExt;

let mut file = tokio::fs::File::open(path).await?;
let mut buffer = vec![0; 8192];

loop {
    let n = file.read(&mut buffer).await?;
    if n == 0 { break; }

    process_chunk(&buffer[..n]);
}
```

**Smart Pointers**:
```rust
// Arc for shared ownership
let shared = Arc::new(data);
let clone = shared.clone();

// Rc for single-threaded sharing
let local = Rc::new(data);

// Box for heap allocation
let boxed = Box::new(large_struct);
```

## Testing Patterns

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_function() {
        let result = my_function("input");
        assert_eq!(result, expected);
    }

    #[tokio::test]
    async fn test_async_function() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

### Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use serial_test::serial;

    #[tokio::test]
    #[serial]
    async fn test_with_database() {
        let temp_dir = TempDir::new().unwrap();
        let db = setup_test_db(&temp_dir).await;

        // Test database operations
    }
}
```

### Mocking with Mockall

```rust
#[cfg(test)]
use mockall::automock;

#[automock]
trait MyTrait {
    fn method(&self, arg: String) -> Result<i32>;
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_with_mock() {
        let mut mock = MockMyTrait::new();
        mock.expect_method()
            .returning(|_| Ok(42));

        assert_eq!(mock.method("test".into()).unwrap(), 42);
    }
}
```

## Best Practices

### Code Organization

1. **One concept per file**: Each file should have a single responsibility
2. **Public API first**: Put public items at the top of files
3. **Tests alongside code**: Use `#[cfg(test)]` modules
4. **Documentation**: Use `///` for public items, `//` for implementation notes

### Naming Conventions

- **Types**: `PascalCase`
- **Functions**: `snake_case`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Modules**: `snake_case`
- **Traits**: `PascalCase` (often ending in -able, -er)

### Error Messages

- **Descriptive**: Include context about what failed
- **Actionable**: Suggest how to fix the issue
- **No stack traces**: Frontend users don't need internal details
- **Log internally**: Use `tracing` for detailed errors

### Documentation

```rust
/// Processes a user request and returns the result.
///
/// # Arguments
///
/// * `request` - The user's request string
/// * `context` - Additional context for processing
///
/// # Returns
///
/// Returns `Ok(Response)` on success or `Err` if processing fails.
///
/// # Examples
///
/// ```
/// let response = process_request("query", &context)?;
/// ```
///
/// # Errors
///
/// This function will return an error if:
/// - The request is empty
/// - The context is invalid
/// - Processing fails
pub fn process_request(request: &str, context: &Context) -> Result<Response> {
    // Implementation
}
```

## Common Patterns

### Lazy Static Initialization

```rust
use std::sync::LazyLock;

static GLOBAL_CACHE: LazyLock<Cache> = LazyLock::new(|| {
    Cache::new()
});
```

### Builder Pattern

```rust
pub struct ConfigBuilder {
    timeout: Option<Duration>,
    retries: Option<u32>,
}

impl ConfigBuilder {
    pub fn new() -> Self {
        Self {
            timeout: None,
            retries: None,
        }
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn retries(mut self, retries: u32) -> Self {
        self.retries = Some(retries);
        self
    }

    pub fn build(self) -> Config {
        Config {
            timeout: self.timeout.unwrap_or(Duration::from_secs(30)),
            retries: self.retries.unwrap_or(3),
        }
    }
}
```

### Type State Pattern

```rust
struct Locked;
struct Unlocked;

struct Connection<State> {
    inner: InnerConnection,
    _state: PhantomData<State>,
}

impl Connection<Locked> {
    fn unlock(self) -> Connection<Unlocked> {
        // Unlock
        Connection {
            inner: self.inner,
            _state: PhantomData,
        }
    }
}

impl Connection<Unlocked> {
    fn query(&self, sql: &str) -> Result<()> {
        // Only unlocked connections can query
    }
}
```

## Debugging Tips

### Enable Tracing

```bash
RUST_LOG=debug cargo tauri dev
```

### Inspect State

```rust
#[tauri::command]
async fn debug_state(state: State<'_, MyState>) -> Result<String, String> {
    let data = state.0.lock().await;
    Ok(format!("{:#?}", data))
}
```

### Measure Performance

```rust
use std::time::Instant;

let start = Instant::now();
expensive_operation();
tracing::info!("Operation took {:?}", start.elapsed());
```

### Database Queries

```rust
conn.trace(Some(|stmt| {
    println!("SQL: {}", stmt);
}));
```

## Further Reading

- [Rust Book](https://doc.rust-lang.org/book/)
- [Async Book](https://rust-lang.github.io/async-book/)
- [Tauri Docs](https://tauri.app/v2/)
- [Tokio Guide](https://tokio.rs/tokio/tutorial)
- [SQLite Docs](https://www.sqlite.org/docs.html)

## Contributing

When adding new functionality:

1. Follow the module structure
2. Add rustdoc comments to public APIs
3. Write unit tests
4. Update this documentation
5. Run `cargo clippy` and fix warnings
6. Ensure `cargo test` passes
