# Executor Architecture

This document provides comprehensive documentation for the AGI Workforce executor architecture. The executor system is the core mechanism through which the AGI executes tools to accomplish user goals.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [ToolExecutor Trait](#toolexecutor-trait)
4. [Available Executors](#available-executors)
5. [ExecutorRegistry](#executorregistry)
6. [ExecutorContext](#executorcontext)
7. [Adding a New Executor](#adding-a-new-executor)
8. [Security Patterns](#security-patterns)
9. [Event Emission Patterns](#event-emission-patterns)
10. [Undo/Reversibility Patterns](#undoreversibility-patterns)
11. [Testing Guidelines](#testing-guidelines)
12. [Error Handling](#error-handling)
13. [Best Practices](#best-practices)

---

## Overview

The executor architecture provides a modular, trait-based system for executing AGI tools. Each tool category has its own executor implementing the `ToolExecutor` trait, which allows for:

- **Separation of concerns**: Each executor handles a specific domain (files, git, database, etc.)
- **Security isolation**: Each executor implements domain-specific security validations
- **Testability**: Executors can be unit tested independently
- **Extensibility**: New executors can be added without modifying existing code
- **Undo capability**: All executors support the reversibility principle via `ChangeTracker`

### Key Files

| File                               | Purpose                                             |
| ---------------------------------- | --------------------------------------------------- |
| `core/agi/executor.rs`             | Main `AGIExecutor` that orchestrates tool execution |
| `core/agi/executors/mod.rs`        | `ToolExecutor` trait and `ExecutorRegistry`         |
| `core/agi/executors/*_executor.rs` | Individual executor implementations                 |
| `sys/security/tool_guard.rs`       | `ToolExecutionGuard` for security validation        |
| `ui/events/tool_stream.rs`         | Event emission types and helpers                    |

---

## Architecture Diagram

```
AGIExecutor
    |
    +-- Security Validation (ToolExecutionGuard)
    |
    +-- Cache Check (ToolResultCache)
    |
    +-- ExecutorRegistry
            |
            +-- FileExecutor
            |       file_read, file_write, file_delete
            |
            +-- UiExecutor
            |       ui_screenshot, ui_click, ui_type
            |
            +-- BrowserExecutor
            |       browser_navigate, browser_click, browser_extract
            |
            +-- DatabaseExecutor
            |       db_query, db_execute, db_transaction_*
            |
            +-- GitExecutor
            |       git_status, git_init, git_add, git_commit, git_push, git_clone
            |
            +-- EmailExecutor
            |       email_send, email_fetch
            |
            +-- CalendarExecutor
            |       calendar_create_event, calendar_list_events
            |
            +-- CloudExecutor
            |       cloud_upload, cloud_download
            |
            +-- SearchExecutor
            |       search_web
            |
            +-- TerminalExecutor
            |       terminal_execute
            |
            +-- CodeExecutor
            |       code_execute, code_analyze
            |
            +-- ApiExecutor
            |       api_call, api_upload, api_download
            |
            +-- LlmExecutor
            |       llm_reason
            |
            +-- ProductivityExecutor
            |       productivity_*, document_*
            |
            +-- OcrExecutor
            |       ocr_extract, ocr_analyze
            |
            +-- OutcomeExecutor
            |       measure_*, track_outcome, get_success_rate
            |
            +-- McpExecutor (dynamic)
                    mcp__<server>__<tool>
```

---

## ToolExecutor Trait

The `ToolExecutor` trait is the core abstraction that all executors must implement:

```rust
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Returns the list of tool names this executor handles.
    /// These are the tool IDs that will be routed to this executor.
    fn tool_names(&self) -> Vec<&'static str>;

    /// Executes a tool with the given parameters.
    ///
    /// # Arguments
    /// * `tool_name` - The name of the tool to execute
    /// * `parameters` - Tool parameters as key-value pairs
    /// * `context` - Executor context with app handle, services, etc.
    /// * `execution_context` - AGI execution context with goal and state
    ///
    /// # Returns
    /// JSON value containing the tool result, or an error
    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<JsonValue>;

    /// Returns a human-readable description of this executor.
    fn description(&self) -> &'static str;
}
```

### Key Responsibilities

1. **Tool Registration**: Declare which tools this executor handles via `tool_names()`
2. **Parameter Validation**: Validate required parameters before execution
3. **Security Validation**: Validate paths, URLs, SQL, etc. for security
4. **Execution**: Perform the actual operation
5. **Undo Tracking**: Record changes via `ChangeTracker` for reversibility
6. **Event Emission**: Emit progress/completion events for UI feedback
7. **Result Formatting**: Return structured JSON results

---

## Available Executors

### FileExecutor

**Location**: `core/agi/executors/file_executor.rs`

**Tools**:
| Tool | Description | Parameters |
|------|-------------|------------|
| `file_read` | Read file contents | `path` (required) |
| `file_write` | Write/create file | `path`, `content` (required) |
| `file_delete` | Delete file | `path` (required) |

**Security Features**:

- Path canonicalization to prevent traversal attacks
- Allowed directories validation
- Symlink resolution
- Directory deletion prevention (files only)

**Undo Support**: Full - tracks file creates, modifies, and deletes

---

### GitExecutor

**Location**: `core/agi/executors/git_executor.rs`

**Tools**:
| Tool | Description | Parameters |
|------|-------------|------------|
| `git_status` | Get repo status | `path` (required) |
| `git_init` | Initialize repo | `path` (required) |
| `git_add` | Stage files | `path`, `files[]` (required) |
| `git_commit` | Create commit | `path`, `message` (required) |
| `git_push` | Push to remote | `path` (required), `remote`, `branch` |
| `git_clone` | Clone repository | `url`, `destination` (required) |

**Security Features**:

- Path validation for all operations
- SSH/HTTPS authentication support
- File path escape prevention in `git_add`

**Undo Support**: Commits tracked for audit trail (not auto-revertible)

---

### DatabaseExecutor

**Location**: `core/agi/executors/database_executor.rs`

**Tools**:
| Tool | Description | Parameters |
|------|-------------|------------|
| `db_query` | Read-only queries | `database_id`, `query` (required) |
| `db_execute` | Write operations | `connection_id`, `sql`, `params[]` |
| `db_transaction_begin` | Start transaction | `connection_id` (required) |
| `db_transaction_commit` | Commit transaction | `connection_id` (required) |
| `db_transaction_rollback` | Rollback transaction | `connection_id` (required) |

**Security Features**:

- SQL injection detection for `db_query`
- Dangerous keyword blocking (DROP, DELETE, etc. in read-only mode)
- Multiple statement detection
- Query length limits (1MB max)
- Parameter count limits (1000 max)

**Blocked Keywords in `db_query`**:

```
DROP, TRUNCATE, DELETE, ALTER, CREATE, RENAME, INSERT, UPDATE,
REPLACE, MERGE, UPSERT, GRANT, REVOKE, VACUUM, ANALYZE, REINDEX,
CLUSTER, BEGIN, COMMIT, ROLLBACK, SAVEPOINT, EXEC, EXECUTE, CALL,
COPY, LOAD, ATTACH, DETACH, PRAGMA
```

---

### McpExecutor

**Location**: `core/agi/executors/mcp_executor.rs`

**Tools**: Dynamic - discovered from connected MCP servers

**Tool ID Format**: `mcp__<server_name>__<tool_name>`

Examples:

- `mcp__filesystem__read_file`
- `mcp__github__list_repos`
- `mcp__slack__send_message`

**Features**:

- Dynamic tool discovery from MCP servers
- Timeout support (default 30s, max 5min)
- Progress event emission
- User-friendly error translation
- Statistics tracking

**Error Translation** (per CLAUDE.md requirements):

```rust
// Technical error -> User-friendly message
"ECONNREFUSED" -> "Could not connect to the service. Please check your internet connection."
"permission denied" -> "Permission denied. You may need to authorize this action."
"rate limit" -> "Too many requests. Please wait a moment and try again."
```

---

### Other Executors

| Executor               | Tools                                                  | Purpose                  |
| ---------------------- | ------------------------------------------------------ | ------------------------ |
| `UiExecutor`           | `ui_screenshot`, `ui_click`, `ui_type`                 | Desktop UI automation    |
| `BrowserExecutor`      | `browser_navigate`, `browser_click`, `browser_extract` | Web browser automation   |
| `EmailExecutor`        | `email_send`, `email_fetch`                            | Email operations         |
| `CalendarExecutor`     | `calendar_create_event`, `calendar_list_events`        | Calendar management      |
| `CloudExecutor`        | `cloud_upload`, `cloud_download`                       | Cloud storage operations |
| `SearchExecutor`       | `search_web`                                           | Web search               |
| `TerminalExecutor`     | `terminal_execute`                                     | Shell command execution  |
| `CodeExecutor`         | `code_execute`, `code_analyze`                         | Code execution/analysis  |
| `ApiExecutor`          | `api_call`, `api_upload`, `api_download`               | HTTP API calls           |
| `LlmExecutor`          | `llm_reason`                                           | LLM reasoning operations |
| `ProductivityExecutor` | `productivity_*`, `document_*`                         | Productivity tools       |
| `OcrExecutor`          | `ocr_extract`, `ocr_analyze`                           | OCR operations           |
| `OutcomeExecutor`      | `measure_*`, `track_outcome`                           | Outcome measurement      |

---

## ExecutorRegistry

The `ExecutorRegistry` manages all executor instances and routes tool calls:

```rust
pub struct ExecutorRegistry {
    executors: HashMap<String, Arc<dyn ToolExecutor>>,
    mcp_executor: Option<Arc<McpExecutor>>,
}
```

### Key Methods

```rust
impl ExecutorRegistry {
    /// Creates registry with all executors registered
    pub fn new(
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
    ) -> Self;

    /// Creates registry with MCP support
    pub fn with_mcp(
        automation: Arc<AutomationService>,
        router: Arc<tokio::sync::RwLock<LLMRouter>>,
        mcp_client: Arc<McpClient>,
    ) -> Self;

    /// Gets executor for a tool name (routes MCP tools automatically)
    pub fn get_executor(&self, tool_name: &str) -> Option<Arc<dyn ToolExecutor>>;

    /// Returns all registered tool names
    pub fn tool_names(&self) -> Vec<&str>;

    /// Returns all tools including dynamic MCP tools
    pub fn all_tool_names(&self) -> Vec<String>;

    /// Number of unique executors
    pub fn executor_count(&self) -> usize;
}
```

### Registration Pattern

When creating the registry, each executor is instantiated and its tools are registered:

```rust
let file_exec: Arc<dyn ToolExecutor> = Arc::new(FileExecutor::new());
for name in file_exec.tool_names() {
    executors.insert(name.to_string(), file_exec.clone());
}
```

---

## ExecutorContext

The `ExecutorContext` provides shared resources to all executors:

```rust
pub struct ExecutorContext {
    /// Optional Tauri app handle for UI events and state access
    pub app_handle: Option<tauri::AppHandle>,

    /// Automation service for UI/browser operations
    pub automation: Arc<AutomationService>,

    /// LLM router for reasoning operations
    pub router: Arc<tokio::sync::RwLock<LLMRouter>>,

    /// Tool result cache
    pub tool_cache: Arc<ToolResultCache>,

    /// Security guard for tool validation
    pub security_guard: Arc<ToolExecutionGuard>,

    /// Change tracker for undo capability (CRITICAL for safety)
    pub change_tracker: Option<Arc<ChangeTracker>>,

    /// Current session ID
    pub session_id: String,

    /// Current tool execution ID
    pub tool_id: String,
}
```

### Helper Methods

```rust
impl ExecutorContext {
    /// Get allowed directories for file operations
    pub fn get_allowed_directories(&self) -> Vec<PathBuf>;

    /// Emit progress event to UI
    pub fn emit_progress(&self, message: &str, progress: Option<f32>);

    /// Emit error event to UI
    pub fn emit_error(&self, error: &str, start_time: Instant, recoverable: bool);

    /// Emit completion event to UI
    pub fn emit_completed(&self, result: &JsonValue, start_time: Instant);
}
```

---

## Adding a New Executor

Follow these steps to add a new executor:

### Step 1: Create the Executor File

Create a new file in `core/agi/executors/`:

```rust
// core/agi/executors/my_executor.rs

//! My domain operations executor.
//!
//! Handles [describe domain] operations including [list operations].
//!
//! # Security
//!
//! [Describe security considerations]
//!
//! # Undo Capability
//!
//! [Describe how undo is implemented]

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Executor for [domain] operations.
pub struct MyExecutor;

impl MyExecutor {
    /// Create a new executor.
    pub fn new() -> Self {
        Self
    }

    /// Execute my_tool_a operation.
    async fn execute_tool_a(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        // 1. Extract and validate parameters
        let param = parameters
            .get("param")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'param' parameter"))?;

        // 2. Perform security validation if needed
        // self.validate_something(param, context)?;

        // 3. Execute the operation
        let result = do_something(param)?;

        // 4. Track changes for undo if applicable
        if let Some(ref tracker) = context.change_tracker {
            tracker.record_something(...).await;
        }

        // 5. Emit events for UI
        // context.emit_progress("Operation complete", Some(1.0));

        // 6. Log the operation
        tracing::info!(
            "[MyExecutor] my_tool_a completed: param='{}'",
            param
        );

        // 7. Return structured result
        Ok(json!({
            "success": true,
            "result": result
        }))
    }
}

impl Default for MyExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for MyExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["my_tool_a", "my_tool_b"]
    }

    fn description(&self) -> &'static str {
        "Handles [domain] operations including [operations]"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "my_tool_a" => self.execute_tool_a(parameters, context).await,
            "my_tool_b" => self.execute_tool_b(parameters, context).await,
            _ => Err(anyhow!("Unknown my_executor tool: {}", tool_name)),
        }
    }
}
```

### Step 2: Add Module Declaration

In `core/agi/executors/mod.rs`:

```rust
mod my_executor;

pub use my_executor::MyExecutor;
```

### Step 3: Register in ExecutorRegistry

In `ExecutorRegistry::new()`:

```rust
let my_exec: Arc<dyn ToolExecutor> = Arc::new(MyExecutor::new());
for name in my_exec.tool_names() {
    executors.insert(name.to_string(), my_exec.clone());
}
```

### Step 4: Add Security Policies (Optional)

In `sys/security/tool_guard.rs`, add policies for your tools:

```rust
allowed_tools.insert(
    "my_tool_a".to_string(),
    ToolPolicy {
        max_rate_per_minute: 30,
        requires_approval: false,
        allowed_parameters: vec!["param".to_string()],
        risk_level: RiskLevel::Low,
    },
);
```

### Step 5: Add Tests

Create `core/agi/executors/tests/my_executor_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_context() -> ExecutorContext {
        // ... setup test context
    }

    #[test]
    fn test_tool_names() {
        let executor = MyExecutor::new();
        let names = executor.tool_names();
        assert!(names.contains(&"my_tool_a"));
    }

    #[tokio::test]
    async fn test_my_tool_a_success() {
        // ... test implementation
    }

    #[tokio::test]
    async fn test_my_tool_a_missing_param() {
        // ... test error handling
    }
}
```

---

## Security Patterns

### Path Validation

For file/directory operations, always validate paths:

```rust
fn validate_path(path: &Path, context: &ExecutorContext, operation: &str) -> Result<PathBuf> {
    // 1. Canonicalize to resolve symlinks and ".."
    let canonical_path = std::fs::canonicalize(path)
        .map_err(|e| anyhow!("Invalid or inaccessible path '{}': {}", path.display(), e))?;

    // 2. Get allowed directories from context
    let allowed_directories = context.get_allowed_directories();

    // 3. Validate path is within allowed directories
    let path_allowed = if allowed_directories.is_empty() {
        tracing::warn!(
            "[MyExecutor] No allowed_directories configured - {} unrestricted",
            operation
        );
        true
    } else {
        allowed_directories
            .iter()
            .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
    };

    if !path_allowed {
        tracing::error!(
            "[MyExecutor] Path traversal attempt blocked: '{}' is outside allowed directories",
            canonical_path.display()
        );
        return Err(anyhow!(
            "Access denied: path '{}' is outside allowed directories",
            path.display()
        ));
    }

    Ok(canonical_path)
}
```

### SQL Injection Prevention

For database operations:

```rust
// Block dangerous keywords in read-only queries
const DANGEROUS_SQL_KEYWORDS: &[&str] = &[
    "DROP", "TRUNCATE", "DELETE", "ALTER", "CREATE", ...
];

fn validate_query(query: &str) -> Result<()> {
    let normalized = query.to_uppercase();

    for keyword in DANGEROUS_SQL_KEYWORDS {
        // Check at word boundaries
        if word_matches_keyword(&normalized, keyword) {
            return Err(anyhow!(
                "Dangerous SQL operation '{}' is not allowed in db_query",
                keyword
            ));
        }
    }

    // Check for multiple statements
    check_multiple_statements(query)?;

    Ok(())
}
```

### Rate Limiting

The `ToolExecutionGuard` automatically enforces rate limits:

```rust
// In ToolExecutionGuard::new()
allowed_tools.insert(
    "my_tool".to_string(),
    ToolPolicy {
        max_rate_per_minute: 30,  // Maximum calls per minute
        requires_approval: false,
        allowed_parameters: vec!["param".to_string()],
        risk_level: RiskLevel::Medium,
    },
);
```

### Input Sanitization

Always validate and sanitize user inputs:

```rust
// Validate required parameters
let param = parameters
    .get("param")
    .and_then(|v| v.as_str())
    .ok_or_else(|| anyhow!("Missing required 'param' parameter"))?;

// Validate format
if param.is_empty() {
    return Err(anyhow!("Parameter 'param' cannot be empty"));
}

// Validate length
if param.len() > MAX_LENGTH {
    return Err(anyhow!("Parameter 'param' exceeds maximum length"));
}

// Sanitize if needed
let sanitized = sanitize_input(param);
```

---

## Event Emission Patterns

### Tool Stream Events

The system emits events for real-time UI updates:

```rust
// Event types
pub enum ToolStreamEvent {
    Started { tool_id, tool_name, parameters, estimated_duration_ms },
    Progress { tool_id, progress, message, bytes_processed, bytes_total },
    OutputChunk { tool_id, chunk, chunk_type, is_final },
    Completed { tool_id, result, duration_ms },
    Error { tool_id, error, error_code, duration_ms, retryable },
    Cancelled { tool_id, reason, duration_ms },
}
```

### Emitting Events

Use the helper functions:

```rust
// In your executor
use crate::ui::events::tool_stream::*;

// Emit started
emit_tool_started(app_handle, &tool_id, "my_tool", Some(params_json));

// Emit progress
emit_tool_progress(app_handle, &tool_id, 0.5, Some("Processing..."));

// Emit progress with bytes
emit_tool_progress_bytes(app_handle, &tool_id, bytes_done, total_bytes, Some("Downloading..."));

// Emit completion
emit_tool_completed(app_handle, &tool_id, result_json, duration_ms);

// Emit error
emit_tool_error(app_handle, &tool_id, "Error message", duration_ms, true /* retryable */);
```

### Using ExecutorContext Helpers

The context provides convenience methods:

```rust
// Progress
context.emit_progress("Processing item 5 of 10", Some(0.5));

// Error
context.emit_error("Failed to connect", start_time, true /* recoverable */);

// Completion
context.emit_completed(&result, start_time);
```

### Using ToolStreamContext

For complex operations with multiple events:

```rust
use crate::ui::events::tool_stream::ToolStreamContext;

async fn execute_complex_operation(&self, context: &ExecutorContext) -> Result<Value> {
    let stream = ToolStreamContext::new(
        context.app_handle.as_ref().unwrap(),
        &context.tool_id,
        "complex_operation",
        Some(params_json),
    )
    .with_session_id(&context.session_id);

    // Report progress
    stream.progress(0.25, Some("Step 1 complete"));

    // Stream output
    stream.stdout("Processing...\n");
    stream.stderr("Warning: ...\n");

    // Report progress with bytes
    stream.progress_bytes(1024, 4096, Some("Downloading"));

    // Complete or error
    if success {
        stream.complete(result);
    } else {
        stream.error("Operation failed", true /* retryable */);
    }
}
```

---

## Undo/Reversibility Patterns

Per CLAUDE.md: "All actions must be reversible. This enables full autonomy while maintaining safety."

### Using ChangeTracker

```rust
// Track file creation
if let Some(ref tracker) = context.change_tracker {
    tracker
        .record_file_created(
            PathBuf::from(&canonical_path),
            content.to_string(),
            context.session_id.clone(),
        )
        .await;
}

// Track file modification
if let Some(ref tracker) = context.change_tracker {
    tracker
        .record_file_modified(
            PathBuf::from(&canonical_path),
            old_content,
            new_content.to_string(),
            context.session_id.clone(),
        )
        .await;
}

// Track file deletion
if let Some(ref tracker) = context.change_tracker {
    tracker
        .record_file_deleted(
            PathBuf::from(&canonical_path),
            content_before.clone(),
            context.session_id.clone(),
        )
        .await;
}

// Track git commit (for audit, not auto-revertible)
if let Some(ref tracker) = context.change_tracker {
    tracker
        .record_git_commit(
            PathBuf::from(&repo_path),
            commit_hash.clone(),
            message.to_string(),
            context.session_id.clone(),
        )
        .await;
}
```

### Patterns by Operation Type

| Operation       | Undo Strategy                               |
| --------------- | ------------------------------------------- |
| File create     | Store path, delete on undo                  |
| File modify     | Store old content, restore on undo          |
| File delete     | Store content, recreate on undo             |
| Git commit      | Store commit hash for audit (manual revert) |
| Database insert | Store ID, delete on undo                    |
| Database update | Store old values, restore on undo           |
| Database delete | Store full record, reinsert on undo         |
| API call        | May not be reversible - log for audit       |

---

## Testing Guidelines

### Test Structure

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tempfile::TempDir;

    // ============================================================================
    // Test Fixtures
    // ============================================================================

    fn create_test_context() -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            automation: Arc::new(crate::automation::AutomationService::new()),
            router: Arc::new(tokio::sync::RwLock::new(
                crate::core::llm::LLMRouter::empty(),
            )),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "test_goal".to_string(),
                description: "Test goal".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: ResourceState::default(),
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    // ============================================================================
    // Basic Tests
    // ============================================================================

    #[test]
    fn test_tool_names() {
        let executor = MyExecutor::new();
        let names = executor.tool_names();
        assert!(names.contains(&"my_tool"));
        assert_eq!(names.len(), N);
    }

    #[test]
    fn test_description() {
        let executor = MyExecutor::new();
        assert!(!executor.description().is_empty());
    }

    // ============================================================================
    // Parameter Validation Tests
    // ============================================================================

    #[tokio::test]
    async fn test_missing_required_parameter() {
        let executor = MyExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("my_tool", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Missing required"));
    }

    // ============================================================================
    // Success Path Tests
    // ============================================================================

    #[tokio::test]
    async fn test_success() {
        let temp_dir = TempDir::new().unwrap();
        // ... setup

        let executor = MyExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert("param".to_string(), Value::String("value".to_string()));

        let result = executor
            .execute("my_tool", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
    }

    // ============================================================================
    // Error Handling Tests
    // ============================================================================

    #[tokio::test]
    async fn test_unknown_tool() {
        let executor = MyExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("unknown_tool", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown"));
    }

    // ============================================================================
    // Security Tests
    // ============================================================================

    #[tokio::test]
    async fn test_path_traversal_blocked() {
        // Test that "../" paths are blocked
    }

    #[tokio::test]
    async fn test_sql_injection_blocked() {
        // Test that SQL injection is blocked
    }
}
```

### Test Categories

1. **Basic Tests**: `tool_names()`, `description()`, `Default` impl
2. **Parameter Validation**: Missing, null, wrong type, invalid values
3. **Success Paths**: Normal operation with valid inputs
4. **Error Handling**: Invalid inputs, resource not found, permission denied
5. **Security Tests**: Path traversal, injection, unauthorized access
6. **Integration Tests**: Multi-step operations, state changes
7. **Edge Cases**: Empty inputs, unicode, special characters, large inputs

### Running Tests

```bash
# Run all executor tests
cd apps/desktop/src-tauri && cargo test executors

# Run specific executor tests
cargo test file_executor
cargo test git_executor
cargo test database_executor

# Run with output
cargo test file_executor -- --nocapture
```

---

## Error Handling

### Error Message Guidelines

Per CLAUDE.md: "Errors must be friendly. Never show stack traces or technical codes to users."

```rust
// BAD: Technical error
Err(anyhow!("ENOENT: no such file or directory, open '/path'"))

// GOOD: User-friendly error
Err(anyhow!("Could not find the file '{}'. Please check the path and try again.", path))

// BAD: MCP technical error
Err(anyhow!("MCP server 'gmail' returned ECONNREFUSED"))

// GOOD: User-friendly MCP error
Err(anyhow!("Could not connect to your email. Please check your internet connection."))
```

### Error Translation Pattern

```rust
fn translate_error(error: &SomeError) -> String {
    match error {
        SomeError::ConnectionFailed(msg) => {
            if msg.contains("ECONNREFUSED") {
                "Could not connect. Please check your internet connection.".to_string()
            } else if msg.contains("timeout") {
                "The connection timed out. Please try again.".to_string()
            } else {
                "Could not connect. Please try again later.".to_string()
            }
        }
        SomeError::NotFound(_) => "The requested item was not found.".to_string(),
        SomeError::PermissionDenied(_) => {
            "Permission denied. You may need to authorize this action.".to_string()
        }
        _ => format!("An error occurred: {}", error)
    }
}
```

---

## Best Practices

### 1. Always Validate Parameters Early

```rust
async fn execute_tool(&self, params: &HashMap<String, Value>, ...) -> Result<Value> {
    // Validate ALL required params first
    let path = params.get("path").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing required 'path' parameter"))?;
    let content = params.get("content").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing required 'content' parameter"))?;

    // Then proceed with execution
}
```

### 2. Use Structured Logging

```rust
tracing::info!(
    "[MyExecutor] my_tool completed: path='{}' size={} bytes result={}",
    path.display(),
    content.len(),
    if success { "success" } else { "failed" }
);
```

### 3. Return Consistent JSON Structures

```rust
// Success
Ok(json!({
    "success": true,
    "path": canonical_path.to_string_lossy(),
    "bytes_written": content.len(),
    "created": was_new_file
}))

// Error (when returning error as result)
Ok(json!({
    "success": false,
    "error": "User-friendly error message",
    "error_code": "SOME_CODE"  // optional, for programmatic handling
}))
```

### 4. Invalidate Cache After Mutations

```rust
// After file_write, invalidate file_read cache
let mut read_params = HashMap::new();
read_params.insert("path".to_string(), json!(canonical_path.to_string_lossy()));
let _ = context.tool_cache.invalidate("file_read", &read_params);
```

### 5. Document Security Considerations

```rust
//! # Security
//!
//! - All paths are canonicalized to prevent traversal attacks
//! - Paths are validated against allowed directories
//! - Symlinks are resolved before validation
//! - Directory deletion is prevented (use separate tool)
```

### 6. Emit Progress for Long Operations

```rust
for (i, item) in items.iter().enumerate() {
    context.emit_progress(
        &format!("Processing item {} of {}", i + 1, items.len()),
        Some((i + 1) as f32 / items.len() as f32)
    );
    process_item(item).await?;
}
```

### 7. Handle Cancellation

```rust
// Check for cancellation periodically in long operations
if context.is_cancelled() {
    context.emit_cancelled(Some("Operation cancelled by user"));
    return Err(anyhow!("Operation cancelled"));
}
```

---

## Appendix: Tool Risk Levels

| Risk Level | Description                                 | Examples                                   |
| ---------- | ------------------------------------------- | ------------------------------------------ |
| `Low`      | Read-only, no side effects                  | `file_read`, `git_status`, `ui_screenshot` |
| `Medium`   | Limited side effects, reversible            | `file_write`, `ui_click`, `ui_type`        |
| `High`     | Significant side effects, may need approval | `browser_navigate`, `db_query`, `api_call` |
| `Critical` | Potentially destructive, requires approval  | `code_execute`, `terminal_execute`         |

---

## Related Documentation

- [CLAUDE.md](/CLAUDE.md) - Main project documentation
- [MCP Integration](/docs/features/mcp/mcp-integration.md) - MCP server integration
- [Security](/docs/security/README.md) - Security documentation
- [Testing](/docs/development/testing.md) - Testing guidelines
