//! # Hooks System for AGI Workforce
//!
//! A flexible hooks system inspired by Claude Code that allows users to run custom
//! commands at key lifecycle events in the AGI workflow.
//!
//! ## Overview
//!
//! Hooks fire at specific lifecycle events and execute user-defined shell commands.
//! This enables powerful automation workflows like:
//!
//! - Running linters after file modifications
//! - Logging all tool executions for auditing
//! - Custom notifications on session start/end
//! - Validation before dangerous operations
//!
//! ## Supported Events
//!
//! | Event | Description | Blocking | Supports Matcher |
//! |-------|-------------|----------|------------------|
//! | `SessionStart` | AGI session begins | No | No |
//! | `SessionEnd` | AGI session ends | No | No |
//! | `UserPromptSubmit` | User sends a prompt | No | No |
//! | `PreToolUse` | Before tool execution | **Yes** | Yes |
//! | `PostToolUse` | After successful tool execution | No | Yes |
//! | `PostToolUseFailure` | After failed tool execution | No | Yes |
//! | `PermissionRequest` | Permission is requested | **Yes** | No |
//! | `SubagentStart` | Sub-agent is spawned | No | No |
//! | `SubagentStop` | Sub-agent terminates | No | No |
//! | `Stop` | AGI is stopped | No | No |
//! | `PreCompact` | Before context compaction | No | No |
//! | `Notification` | Notification is generated | No | No |
//!
//! ## Configuration
//!
//! Hooks are configured in settings.json under the `hooks` key:
//!
//! ```json
//! {
//!   "hooks": {
//!     "PostToolUse": [{
//!       "matcher": "Write|Edit",
//!       "hooks": [{
//!         "type": "command",
//!         "command": "./scripts/run-linter.sh",
//!         "timeout_ms": 30000
//!       }]
//!     }],
//!     "SessionStart": [{
//!       "hooks": [{
//!         "type": "command",
//!         "command": "echo 'Session started'"
//!       }]
//!     }]
//!   }
//! }
//! ```
//!
//! ## Matchers
//!
//! Tool-related events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) support
//! regex matchers to filter which tools trigger the hook:
//!
//! - `"Write|Edit"` - Matches Write OR Edit tools
//! - `"^Bash$"` - Matches exactly "Bash"
//! - `".*"` - Matches all tools (default if no matcher specified)
//!
//! ## Environment Variables
//!
//! Hook commands receive context data via environment variables:
//!
//! | Variable | Description |
//! |----------|-------------|
//! | `AGI_HOOK_EVENT` | Event name (e.g., "PostToolUse") |
//! | `AGI_HOOK_SESSION_ID` | Current session ID |
//! | `AGI_HOOK_TOOL_NAME` | Tool name for tool events |
//! | `AGI_HOOK_TOOL_ID` | Full tool ID (e.g., "mcp__fs__write") |
//! | `AGI_HOOK_TOOL_ARGUMENTS` | Tool arguments as JSON |
//! | `AGI_HOOK_TOOL_RESULT` | Tool result as JSON (PostToolUse) |
//! | `AGI_HOOK_ERROR` | Error message (PostToolUseFailure) |
//! | `AGI_HOOK_DURATION_MS` | Execution duration in milliseconds |
//! | `AGI_HOOK_CONTEXT_JSON` | Full context as JSON |
//!
//! ## Example Usage
//!
//! ```rust,ignore
//! use hooks::{HookExecutor, HookContext, HookEvent, HooksConfig};
//!
//! // Load configuration
//! let config = HooksConfig::from_json(r#"{
//!     "hooks": {
//!         "PostToolUse": [{
//!             "matcher": "Write",
//!             "hooks": [{"type": "command", "command": "./lint.sh"}]
//!         }]
//!     }
//! }"#)?;
//!
//! // Create executor
//! let executor = HookExecutor::new(config);
//! executor.set_working_dir(Some("/path/to/project".into()));
//!
//! // Fire an event
//! let context = HookContext::new(HookEvent::PostToolUse)
//!     .with_session_id("session-123")
//!     .with_tool("Write", "mcp__fs__write")
//!     .with_duration_ms(150);
//!
//! let results = executor.fire(&context).await?;
//! for result in results {
//!     println!("Hook '{}' success: {}", result.command, result.success);
//! }
//! ```
//!
//! ## Safety Notes
//!
//! - Hooks run with the same permissions as the AGI Workforce app
//! - Blocking hooks (PreToolUse, PermissionRequest) can delay AGI execution
//! - Hook failures are logged but don't stop the AGI workflow (except blocking hooks)
//! - Maximum concurrent hooks: 10 (configurable)
//! - Default timeout: 30 seconds (configurable per hook, max 5 minutes)

pub mod config;
pub mod error;
pub mod event;
pub mod executor;

#[cfg(test)]
mod tests;

// Re-exports for convenient access
pub use config::{CompiledMatcher, HookDefinition, HookEntry, HookType, HooksConfig};
pub use error::{HookError, HookResult};
pub use event::{HookContext, HookEvent};
pub use executor::{HookExecutionResult, HookExecutor, HookStats};
