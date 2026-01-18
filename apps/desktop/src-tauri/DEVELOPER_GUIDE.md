# Developer Guide

> Technical reference for the AGI Workforce Rust backend

## Table of Contents

- [Architecture](#architecture)
- [Module Reference](#module-reference)
- [Tauri Commands](#tauri-commands)
- [Database Schema](#database-schema)
- [Security](#security)
- [Patterns & Examples](#patterns--examples)

---

## Architecture

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Rust 2021 Edition |
| Async | Tokio (full features) |
| Database | SQLite (rusqlite + WAL mode) |
| Serialization | Serde (JSON, bincode) |
| HTTP | Reqwest + rustls-tls |
| Crypto | AES-GCM, Argon2, PBKDF2 |
| Concurrency | Rayon, DashMap, parking_lot |

### Directory Structure

```
src/
├── core/                 # AI & Business Logic
│   ├── agi/              # AGI reasoning (19 files)
│   ├── agent/            # Agent system (16 files)
│   ├── llm/              # LLM routing (30+ files)
│   ├── mcp/              # MCP protocol (13 files)
│   ├── embeddings/       # Vector search (6 files)
│   └── orchestration/    # Workflow engine (4 files)
├── sys/                  # System Layer
│   ├── commands/         # Tauri API (70+ files)
│   ├── security/         # Security (24 files)
│   ├── telemetry/        # Logging (8 files)
│   └── permissions/      # RBAC (4 files)
├── data/                 # Persistence
│   ├── db/               # SQLite + migrations
│   ├── cache/            # Caching layers
│   ├── analytics/        # ROI metrics
│   └── settings/         # User preferences
├── automation/           # Desktop Control
│   ├── screen/           # Capture loop
│   ├── browser/          # Web automation
│   ├── input/            # Keyboard/mouse
│   └── uia/              # Windows UI Automation
├── integrations/         # External APIs
│   ├── cloud/            # Dropbox, GDrive, OneDrive
│   ├── realtime/         # WebSocket
│   └── sync/             # Cloud sync
├── features/             # High-Level Features
│   ├── terminal/         # AI terminal
│   ├── document/         # PDF, Word, Excel
│   ├── teams/            # Team management
│   └── calendar/         # Calendar integration
└── ui/                   # UI Layer
    ├── tray.rs           # System tray
    └── window/           # Window management
```

---

## Module Reference

### AGI System (`core/agi/`)

The reasoning engine — 19 files orchestrating goal-oriented execution.

| File | Purpose |
|------|---------|
| `core.rs` | AGICore: Main orchestration, mutex poison recovery |
| `planner.rs` | Breaks goals into executable plans via LLM |
| `executor.rs` | Runs steps, handles tool calls |
| `memory.rs` | Working memory: VecDeque (1000 entries max) |
| `learning.rs` | Experience tracking: success rates, timing |
| `knowledge.rs` | SQLite-backed long-term knowledge |
| `reflection.rs` | Failure analysis, correction generation |
| `orchestrator.rs` | Multi-agent coordination |
| `resources.rs` | CPU, memory, network limits |
| `sandbox.rs` | Safe code execution |

**Coordination Patterns**:
- `Parallel` — Independent concurrent execution
- `Sequential` — Ordered step-by-step
- `Conditional` — Branch based on conditions
- `SupervisorWorker` — Parent delegates to children

### Agent System (`core/agent/`)

High-level agent orchestration — 16 files.

| File | Purpose |
|------|---------|
| `autonomous.rs` | Task queue, self-healing retries (max 3) |
| `approval.rs` | 5 approval rules, dangerous op detection |
| `undo_manager.rs` | Reverts file operations |
| `change_tracker.rs` | Records all agent changes |
| `planner.rs` | LLM-based task decomposition |
| `executor.rs` | Step execution with timeouts |
| `vision.rs` | Screenshot analysis |
| `context_manager.rs` | Context compaction |

**Approval Rules**:
1. `PatternMatch` — Regex on task description
2. `NoFileSystemOps` — Block file operations
3. `NoNetworkOps` — Block network requests
4. `ReadOnly` — Allow reads, block writes
5. `AlwaysRequire` — Always ask

**Step Types**:
`Screenshot`, `Click`, `Type`, `Navigate`, `WaitForElement`, `ExecuteCommand`, `ReadFile`, `WriteFile`, `SearchText`, `Scroll`, `PressKey`

### LLM System (`core/llm/`)

Multi-provider routing — 30+ files.

| File | Purpose |
|------|---------|
| `llm_router.rs` | Provider selection logic |
| `tool_executor.rs` | Function call execution |
| `token_counter.rs` | cl100k_base, o200k_base encodings |
| `cost_calculator.rs` | Real-time cost tracking |
| `cache_manager.rs` | Response caching |
| `sse_parser.rs` | Streaming SSE parsing |

**Providers** (11):
`anthropic.rs`, `openai.rs`, `google.rs`, `deepseek.rs`, `xai.rs`, `perplexity.rs`, `ollama.rs`, `moonshot.rs`, `qwen.rs`, `managed_cloud_provider.rs`

### MCP System (`core/mcp/`)

Model Context Protocol — 13 files.

| File | Purpose |
|------|---------|
| `manager.rs` | Server lifecycle, auto-reconnect |
| `client.rs` | Server communication |
| `registry.rs` | Tool discovery and indexing |
| `transport.rs` | Stdio, HTTP-SSE, WebSocket |
| `health.rs` | Health monitoring |

**Pre-configured**: 40+ servers with secure credential storage.

### Automation (`automation/`)

Desktop control — 16 directories.

| Directory | Purpose |
|-----------|---------|
| `screen/` | 3-sec capture loop, change detection |
| `browser/` | Playwright, CDP, extension bridge |
| `input/` | Keyboard, mouse, clipboard |
| `uia/` | Windows UI Automation |
| `recorder.rs` | Action recording |
| `safety.rs` | Resource limits |

**Screen Capture**:
- Interval: 3 seconds
- Buffer: 10 frames circular
- Resolution: Auto-downscale to 1280px
- Change detection: Hash-based skip

---

## Tauri Commands

### Invocation Pattern

```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ReturnType>('command_name', { param: value });
```

### AGI Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `agi_init` | `config: AGIConfig` | `void` |
| `agi_submit_goal` | `goal, priority?, constraints?` | `{ goal_id, status }` |
| `agi_get_goal_status` | `goal_id` | `{ status, progress, current_step }` |
| `agi_cancel_goal` | `goal_id` | `void` |
| `agi_get_reflection_insights` | `goal_id` | `{ insights[] }` |

### Undo Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `undo_get_summary` | `taskId?` | `{ total_changes, revertible_changes, changes_by_type, recent_changes[] }` |
| `undo_get_changes` | `taskId?, limit?` | `UndoableChange[]` |
| `undo_change` | `changeId` | `{ success, message }` |
| `undo_last` | `taskId?` | `{ success, message }` |
| `undo_task` | `taskId` | `UndoResult[]` |
| `undo_can_undo` | `taskId?` | `boolean` |

### Chat Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `chat_send_message` | `conversation_id, content, model?, attachments?` | `{ message_id }` |
| `chat_create_conversation` | `title?, model?` | `{ conversation_id }` |
| `chat_get_messages` | `conversation_id, limit?, offset?` | `{ messages[] }` |
| `chat_stop_generation` | `conversation_id` | `void` |

**Events**:
- `chat:message:chunk` — Streaming chunk
- `chat:message:complete` — Message done
- `chat:message:error` — Error occurred

### File Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `file_read` | `path` | `{ content, encoding }` |
| `file_write` | `path, content, create_directories?` | `void` |
| `file_delete` | `path` | `void` |
| `dir_list` | `path, recursive?` | `{ entries[] }` |

### Browser Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `browser_launch` | `headless?, viewport?` | `{ browser_id }` |
| `browser_navigate` | `url, wait_until?` | `void` |
| `browser_click` | `selector` | `void` |
| `click_semantic` | `description` | `void` |
| `browser_screenshot` | `full_page?, selector?` | `{ data, width, height }` |

### Terminal Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `terminal_create_session` | `shell?, cwd?, cols?, rows?` | `{ session_id }` |
| `terminal_send_input` | `session_id, data` | `void` |
| `terminal_ai_suggest_command` | `description, cwd?` | `{ command, explanation }` |

### MCP Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `mcp_list_servers` | — | `{ servers[] }` |
| `mcp_list_tools` | `server_id?` | `{ tools[] }` |
| `mcp_call_tool` | `tool_id, parameters` | `{ result, error? }` |
| `mcp_set_credential` | `server_name, key, value` | `void` |

### Security Commands

| Command | Parameters | Returns |
|---------|------------|---------|
| `approve_operation` | `request_id, reason?` | `void` |
| `reject_operation` | `request_id, reason` | `void` |
| `get_audit_events` | `start_time?, event_type?, limit?` | `{ events[], total }` |
| `verify_audit_integrity` | — | `{ is_valid, tampered_events[] }` |

---

## Database Schema

**Location**: `~/.config/agiworkforce/agiworkforce.db`

**Version**: 45

### Pragmas

```sql
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;
```

### Core Tables

```sql
-- Conversations
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    model TEXT,
    system_prompt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    tokens INTEGER,
    cost REAL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Change Tracking (Undo)
CREATE TABLE changes (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    change_type TEXT NOT NULL,  -- 'created', 'modified', 'deleted', 'renamed'
    path TEXT,
    timestamp TEXT NOT NULL,
    previous_content TEXT,
    new_content TEXT,
    metadata TEXT,
    reverted INTEGER DEFAULT 0
);

-- Audit Events
CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL,
    previous_hash TEXT,
    event_hash TEXT NOT NULL
);

-- Approval Requests
CREATE TABLE approval_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    context TEXT,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    expires_at INTEGER
);

-- MCP Servers
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT,
    env TEXT,
    enabled INTEGER DEFAULT 1
);

-- Settings (v2)
CREATE TABLE settings_v2 (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT,
    updated_at INTEGER NOT NULL
);
```

### Migration System

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version = get_current_version(conn)?;
    for migration in &MIGRATIONS[version as usize..] {
        migration.execute(conn)?;
        update_version(conn, migration.version)?;
    }
    Ok(())
}
```

---

## Security

### Architecture

```
┌──────────────────────────────────────┐
│      Policy Engine (ABAC)            │
├──────────────────────────────────────┤
│      Approval Workflow               │
├──────────────────────────────────────┤
│      Audit Logging (Hash Chain)      │
├──────────────────────────────────────┤
│      Secret Management (AES-GCM)     │
├──────────────────────────────────────┤
│      Undo Manager                    │
└──────────────────────────────────────┘
```

### Policy Engine

```rust
match engine.evaluate(&context) {
    PolicyDecision::Allow => { /* proceed */ },
    PolicyDecision::Deny { reason } => { /* reject */ },
    PolicyDecision::RequestApproval { risk_level } => { /* wait */ },
}
```

**Risk Levels**: Low, Medium, High, Critical

### Audit Logging

Hash-chained event trail:

```rust
fn calculate_event_hash(event: &AuditEvent) -> String {
    let mut hasher = Sha256::new();
    hasher.update(event.id.as_bytes());
    hasher.update(event.timestamp.to_le_bytes());
    if let Some(prev) = &event.previous_hash {
        hasher.update(prev.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}
```

### Secret Management

Machine-derived keys (no external keyring):

```rust
let manager = SecretManager::new(db_conn);
manager.set("openai", "api_key", "sk-...").await?;
let key = manager.get("openai", "api_key").await?;
```

---

## Patterns & Examples

### State Management

```rust
// Wrapper pattern
pub struct MyStateWrapper(Arc<Mutex<MyState>>);

#[tauri::command]
async fn use_state(state: State<'_, MyStateWrapper>) -> Result<(), String> {
    let data = state.0.lock().await;
    Ok(())
}
```

### Error Handling

```rust
// Internal: anyhow
fn internal_fn() -> Result<T> {
    do_something().context("Failed")?;
    Ok(result)
}

// Commands: String
#[tauri::command]
async fn command() -> Result<T, String> {
    internal_fn().map_err(|e| format!("{}", e))
}
```

### Event Emission

```rust
use tauri::Manager;
app.emit("event-name", payload)?;
```

### Async Spawning

```rust
use tauri::async_runtime;
async_runtime::spawn(async move {
    // Background task
});
```

### Undo Integration

```rust
use crate::core::agent::undo_manager::UndoManager;

let undo = UndoManager::new(conn);

// Track change
undo.track_file_change(task_id, path, before, after)?;

// Undo last
let result = undo.undo_last(None)?;
```

### Database Transaction

```rust
let tx = conn.transaction()?;
for item in items {
    tx.execute("INSERT INTO ...", params)?;
}
tx.commit()?;
```

---

## Testing

```bash
cargo test                    # All
cargo test test_name          # Specific
cargo test -- --nocapture     # With output
```

### Test Pattern

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_async() {
        let result = async_fn().await;
        assert!(result.is_ok());
    }
}
```

---

## Development

```bash
pnpm dev:desktop      # Dev server
cargo test            # Tests
cargo clippy          # Lint
cargo fmt             # Format
cargo doc --open      # Docs
```

### Logging

```bash
RUST_LOG=debug cargo tauri dev
RUST_LOG=agiworkforce_desktop::core::agi=debug cargo tauri dev
```

---

## Further Reading

- [Tauri Docs](https://v2.tauri.app/)
- [Tokio Guide](https://tokio.rs/tokio/tutorial)
- [Rust Book](https://doc.rust-lang.org/book/)
