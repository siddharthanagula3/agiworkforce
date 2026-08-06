use std::collections::HashMap;
use std::sync::Arc;
use std::thread;

use anyhow::{bail, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::terminal_style as ts;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Status of a running or completed subagent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SubagentStatus {
    /// Subagent is actively working.
    Running,
    /// Subagent completed successfully.
    Completed,
    /// Subagent failed with an error message.
    Failed(String),
    /// Subagent was cancelled by the user or parent agent.
    Cancelled,
}

impl std::fmt::Display for SubagentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubagentStatus::Running => write!(f, "running"),
            SubagentStatus::Completed => write!(f, "completed"),
            SubagentStatus::Failed(msg) => write!(f, "failed: {}", msg),
            SubagentStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Render the `/task list` management view over the spawned-subagent task
/// state `(id, description, status)`. Read-only.
pub fn format_task_list(tasks: &[(String, String, SubagentStatus)]) -> String {
    if tasks.is_empty() {
        return "No subagent tasks in this session yet.\n  \
                Tasks appear here after the model calls the `task` tool to spawn a subagent."
            .to_string();
    }
    let mut lines = vec![format!("Subagent tasks ({})", tasks.len())];
    for (id, description, status) in tasks {
        let desc = if description.trim().is_empty() {
            "(no description)"
        } else {
            description.trim()
        };
        lines.push(format!("  {:<20} [{}] {}", id, status, desc));
    }
    lines.join("\n")
}

/// Result produced by a completed subagent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentResult {
    pub id: String,
    pub output: String,
    pub files_modified: Vec<String>,
}

/// Internal handle tracking a spawned subagent thread.
struct SubagentEntry {
    id: String,
    description: String,
    status: Arc<RwLock<SubagentStatus>>,
    result: Arc<RwLock<Option<SubagentResult>>>,
    /// OS thread handle — each subagent gets its own tokio runtime on a
    /// dedicated thread, avoiding the `Send` constraint of `tokio::spawn`.
    handle: Option<thread::JoinHandle<()>>,
    /// Shared cancellation flag polled by the subagent.
    /// Set by cancel() and checked by the spawned thread.
    #[allow(dead_code)]
    cancelled: Arc<std::sync::atomic::AtomicBool>,
}

// SubagentEntry contains thread::JoinHandle which is not Debug by default.
impl std::fmt::Debug for SubagentEntry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SubagentEntry")
            .field("id", &self.id)
            .field("description", &self.description)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

/// Default maximum number of concurrent subagents.
const DEFAULT_MAX_CONCURRENT: usize = 7;

/// Manages concurrent subagent tasks spawned via `task` or a named `agent`.
///
/// Each subagent runs on a dedicated OS thread with its own tokio runtime,
/// which avoids `Send` requirements that `tokio::spawn` imposes. This lets
/// subagents use the full `AgentSession::send` path (including dialoguer
/// and non-Send callbacks) without restriction.
#[derive(Debug)]
pub struct SubagentManager {
    entries: Arc<RwLock<HashMap<String, SubagentEntry>>>,
    max_concurrent: usize,
    next_id: Arc<RwLock<u64>>,
    /// Cloned config for subagent sessions.
    config: CliConfig,
    /// Model for subagents (inherited from parent).
    model: String,
    /// System context for subagent sessions.
    sys_context: SystemContext,
    /// Whether subagents skip tool confirmation prompts.
    skip_permissions: bool,
    /// Parent permission policy inherited by every subagent.
    permission_mode: crate::cli_options::PermissionMode,
    /// Parent tool filters are inherited by every subagent. Named agent
    /// definitions may narrow these further but never widen them.
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Vec<String>,
}

struct SubagentRunConfig {
    config: CliConfig,
    model: String,
    sys_context: SystemContext,
    skip_permissions: bool,
    permission_mode: crate::cli_options::PermissionMode,
    allowed_tools: Option<Vec<String>>,
    disallowed_tools: Vec<String>,
    named_agent: Option<crate::agents::AgentDefinition>,
}

impl SubagentManager {
    /// Create a new subagent manager.
    pub fn new(
        config: CliConfig,
        model: String,
        sys_context: SystemContext,
        skip_permissions: bool,
        permission_mode: crate::cli_options::PermissionMode,
        allowed_tools: Option<Vec<String>>,
        disallowed_tools: Vec<String>,
    ) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_CONCURRENT,
            next_id: Arc::new(RwLock::new(1)),
            config,
            model,
            sys_context,
            skip_permissions,
            permission_mode,
            allowed_tools,
            disallowed_tools,
        }
    }

    /// Refresh authority-bearing values that can change during a long-lived
    /// interactive session before the next spawn.
    pub fn sync_parent_authority(
        &mut self,
        model: String,
        skip_permissions: bool,
        permission_mode: crate::cli_options::PermissionMode,
        allowed_tools: Option<Vec<String>>,
        disallowed_tools: Vec<String>,
    ) {
        self.model = model;
        self.skip_permissions = skip_permissions;
        self.permission_mode = permission_mode;
        self.allowed_tools = allowed_tools;
        self.disallowed_tools = disallowed_tools;
    }

    /// Spawn a new subagent task. Returns the subagent ID.
    pub async fn spawn(&self, description: &str, prompt: &str) -> Result<String> {
        self.spawn_inner(description, prompt, None).await
    }

    /// Spawn an installed named agent through the same bounded foreground
    /// lifecycle as a generic task.
    pub async fn spawn_named(
        &self,
        definition: crate::agents::AgentDefinition,
        prompt: &str,
    ) -> Result<String> {
        let description = format!("agent {}", definition.name);
        self.spawn_inner(&description, prompt, Some(definition))
            .await
    }

    async fn spawn_inner(
        &self,
        description: &str,
        prompt: &str,
        named_agent: Option<crate::agents::AgentDefinition>,
    ) -> Result<String> {
        // Check concurrency limit
        let running_count = {
            let entries = self.entries.read().await;
            let mut count = 0usize;
            for entry in entries.values() {
                let status = entry.status.read().await;
                if matches!(*status, SubagentStatus::Running) {
                    count += 1;
                }
            }
            count
        };

        if running_count >= self.max_concurrent {
            bail!(
                "Maximum concurrent subagents reached ({}/{}). Wait for some to complete or cancel existing ones.",
                running_count,
                self.max_concurrent
            );
        }

        // Generate ID
        let id = {
            let mut counter = self.next_id.write().await;
            let id = format!("subagent_{}", *counter);
            *counter += 1;
            id
        };

        let status = Arc::new(RwLock::new(SubagentStatus::Running));
        let result: Arc<RwLock<Option<SubagentResult>>> = Arc::new(RwLock::new(None));
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // Clone values for the spawned thread
        let task_id = id.clone();
        let task_prompt = prompt.to_string();
        let task_run_config = SubagentRunConfig {
            config: self.config.clone(),
            model: self.model.clone(),
            sys_context: self.sys_context.clone(),
            skip_permissions: self.skip_permissions,
            permission_mode: self.permission_mode,
            allowed_tools: self.allowed_tools.clone(),
            disallowed_tools: self.disallowed_tools.clone(),
            named_agent,
        };
        let task_status = Arc::clone(&status);
        let task_result = Arc::clone(&result);
        let task_cancelled = Arc::clone(&cancelled);
        let task_description = description.to_string();
        let process_owner = crate::process_tree::current_owner();

        eprintln!(
            "  {} Spawning subagent {} — {}",
            ts::accent_header("[task]"),
            task_id.bold(),
            task_description.dimmed()
        );

        // Spawn on a dedicated OS thread with its own tokio runtime.
        // This avoids the `Send` requirement of `tokio::spawn`.
        let handle = thread::Builder::new()
            .name(format!("subagent-{}", task_id))
            .spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("Failed to create subagent tokio runtime");

                let task = async move {
                    // Check cancellation before starting
                    if task_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                        *task_status.write().await = SubagentStatus::Cancelled;
                        return;
                    }

                    let outcome =
                        run_subagent(&task_run_config, &task_prompt, &task_cancelled).await;

                    // Check cancellation after completion
                    if task_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                        *task_status.write().await = SubagentStatus::Cancelled;
                        return;
                    }

                    match outcome {
                        Ok(output) => {
                            let files = extract_modified_files(&output);

                            let subagent_result = SubagentResult {
                                id: task_id.clone(),
                                output,
                                files_modified: files,
                            };

                            *task_result.write().await = Some(subagent_result);
                            *task_status.write().await = SubagentStatus::Completed;

                            eprintln!(
                                "  {} Subagent {} completed",
                                ts::success_header("[task]"),
                                task_id.bold()
                            );
                        }
                        Err(e) => {
                            let err_msg = format!("{:#}", e);
                            *task_status.write().await = SubagentStatus::Failed(err_msg.clone());

                            eprintln!(
                                "  {} Subagent {} failed: {}",
                                ts::danger_header("[task]"),
                                task_id.bold(),
                                err_msg.dimmed()
                            );
                        }
                    }
                };
                match process_owner {
                    Some(owner) => rt.block_on(crate::process_tree::scope(owner, task)),
                    None => rt.block_on(task),
                }
            })?;

        let entry = SubagentEntry {
            id: id.clone(),
            description: description.to_string(),
            status,
            result,
            handle: Some(handle),
            cancelled,
        };

        self.entries.write().await.insert(id.clone(), entry);

        Ok(id)
    }

    /// Get the status of a subagent by ID.
    pub async fn get_status(&self, id: &str) -> Option<SubagentStatus> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            Some(entry.status.read().await.clone())
        } else {
            None
        }
    }

    /// Get the result of a completed subagent.
    pub async fn get_result(&self, id: &str) -> Option<SubagentResult> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            entry.result.read().await.clone()
        } else {
            None
        }
    }

    /// List all subagents with their current status.
    pub async fn list(&self) -> Vec<(String, String, SubagentStatus)> {
        let entries = self.entries.read().await;
        let mut items = Vec::new();
        for entry in entries.values() {
            let status = entry.status.read().await.clone();
            items.push((entry.id.clone(), entry.description.clone(), status));
        }
        items.sort_by(|a, b| a.0.cmp(&b.0));
        items
    }

    /// Cancel a running subagent.
    /// Will be wired into the /cancel REPL command for subagent management.
    #[allow(dead_code)]
    pub async fn cancel(&self, id: &str) -> Result<()> {
        let entries = self.entries.read().await;
        if let Some(entry) = entries.get(id) {
            // Hold a single write lock for both the check and the update
            // to prevent a TOCTOU race where another thread changes the
            // status between our read and write.
            let mut status = entry.status.write().await;
            if matches!(*status, SubagentStatus::Running) {
                // Signal cancellation — the thread will check this flag.
                entry
                    .cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                *status = SubagentStatus::Cancelled;
                eprintln!(
                    "  {} Subagent {} cancelled",
                    ts::warning_header("[task]"),
                    id.bold()
                );
                Ok(())
            } else {
                let status_display = format!("{}", *status);
                bail!(
                    "Subagent '{}' is not running (status: {})",
                    id,
                    status_display
                )
            }
        } else {
            bail!("Subagent '{}' not found", id)
        }
    }

    /// Wait for all running subagents to complete. Returns a summary.
    pub async fn wait_all(&self) -> Vec<(String, SubagentStatus)> {
        // Collect thread handles
        let handles: Vec<(String, thread::JoinHandle<()>)> = {
            let mut entries = self.entries.write().await;
            entries
                .values_mut()
                .filter_map(|entry| entry.handle.take().map(|h| (entry.id.clone(), h)))
                .collect()
        };

        // Join all threads (blocks the current async task, but each thread
        // has its own runtime so they run truly in parallel).
        for (id, handle) in handles {
            if let Err(_e) = handle.join() {
                eprintln!(
                    "  {} Subagent {} thread panicked",
                    ts::danger_header("[task]"),
                    id.bold()
                );
            }
        }

        // Collect final statuses
        let entries = self.entries.read().await;
        let mut results = Vec::new();
        for entry in entries.values() {
            let status = entry.status.read().await.clone();
            results.push((entry.id.clone(), status));
        }
        results.sort_by(|a, b| a.0.cmp(&b.0));
        results
    }

    /// Cancel and join every subagent owned by this parent session.
    ///
    /// App-server shutdown uses this before acknowledging quiescence so an OS
    /// thread (and any tool process tree running inside it) cannot outlive the
    /// local developer runtime.
    pub async fn shutdown_all(&self) {
        {
            let entries = self.entries.read().await;
            for entry in entries.values() {
                entry
                    .cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                let mut status = entry.status.write().await;
                if matches!(*status, SubagentStatus::Running) {
                    *status = SubagentStatus::Cancelled;
                }
            }
        }
        let _ = self.wait_all().await;
    }

    /// Format a human-readable summary of all subagents.
    #[allow(dead_code)]
    pub async fn format_summary(&self) -> String {
        let items = self.list().await;
        if items.is_empty() {
            return "No subagents have been spawned.".to_string();
        }

        let mut out = format!("Subagents ({}):\n", items.len());
        for (id, description, status) in &items {
            let status_str = match status {
                SubagentStatus::Running => ts::warning("running").to_string(),
                SubagentStatus::Completed => ts::success("completed").to_string(),
                SubagentStatus::Failed(msg) => format!("{}: {}", ts::danger("failed"), msg),
                SubagentStatus::Cancelled => "cancelled".dimmed().to_string(),
            };
            out.push_str(&format!("  {} — {} [{}]\n", id, description, status_str));
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Subagent execution
// ---------------------------------------------------------------------------

/// Run a subagent session: create an AgentSession, send the prompt, return
/// the final response text.
async fn run_subagent(
    run_config: &SubagentRunConfig,
    prompt: &str,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<String> {
    let mut session = crate::agent::AgentSession::new_checked(
        &run_config.model,
        &run_config.sys_context,
        None,
        crate::models::selection_provider_override(
            &run_config.model,
            &run_config.config.default.model,
            &run_config.config.default.provider,
            None,
        ),
    )?;
    session.skip_permissions = run_config.skip_permissions;
    session.permission_mode = run_config.permission_mode;
    session.allowed_tools = run_config.allowed_tools.clone();
    session
        .disallowed_tools
        .clone_from(&run_config.disallowed_tools);
    // Subagents get a reasonable max turns to avoid runaway loops
    session.max_turns = Some(15);
    if let Some(definition) = run_config.named_agent.as_ref() {
        definition.apply_to_subagent_session(&mut session);
    }

    let send_fut = session.send(
        &run_config.config,
        prompt,
        Box::new(|_chunk| {
            // Subagent output is collected silently -- not streamed to terminal.
            // The parent agent receives the full result.
        }),
    );
    tokio::pin!(send_fut);

    // Race the turn against cancellation. If `cancel()` (or the parent's
    // timeout) sets the flag, the cancel branch wins and `send_fut` is dropped
    // on return — which aborts the in-flight provider request, so a cancelled
    // subagent actually stops generating instead of running its turn (and any
    // in-flight tool side effects) to completion.
    let result = tokio::select! {
        biased;
        () = wait_until_cancelled(cancelled) => {
            anyhow::bail!("subagent cancelled");
        }
        r = &mut send_fut => r?,
    };

    Ok(result.response)
}

/// Resolve once the cancellation flag is set, polling cooperatively (every
/// 100ms) so the racing `send` future keeps getting driven until then.
async fn wait_until_cancelled(flag: &std::sync::atomic::AtomicBool) {
    while !flag.load(std::sync::atomic::Ordering::Acquire) {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract file paths modified by a subagent. Tries structured JSON first
/// (a `__modified_files` key in the last line), then falls back to regex
/// pattern matching against tool output messages.
fn extract_modified_files(output: &str) -> Vec<String> {
    // Try structured JSON first — subagents can emit a trailing metadata line
    for line in output.lines().rev().take(5) {
        let trimmed = line.trim();
        if trimmed.starts_with('{') && trimmed.contains("__modified_files") {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if let Some(arr) = meta.get("__modified_files").and_then(|v| v.as_array()) {
                    let paths: Vec<String> = arr
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    if !paths.is_empty() {
                        return paths;
                    }
                }
            }
        }
    }

    // Fallback: regex heuristics on tool output patterns
    let mut files = Vec::new();

    for line in output.lines() {
        if let Some(idx) = line.find("Successfully wrote") {
            if let Some(to_idx) = line[idx..].find(" to ") {
                let path = line[idx + to_idx + 4..].trim();
                if path.starts_with('/') || path.starts_with('.') {
                    files.push(path.to_string());
                }
            }
        }
        if let Some(idx) = line.find("Successfully edited") {
            let rest = line[idx + 19..].trim();
            if let Some(path) = rest.split_whitespace().next() {
                if path.starts_with('/') || path.starts_with('.') {
                    files.push(path.to_string());
                }
            }
        }
    }

    files.sort();
    files.dedup();
    files
}

// ---------------------------------------------------------------------------
// Tool execution for the `Task` tool
// ---------------------------------------------------------------------------

/// Maximum time `execute_task` will wait for a single subagent to leave the
/// `Running` state before surfacing a timeout. Guards against a subagent stuck
/// on a non-returning provider call or hung tool blocking the parent forever.
const SUBAGENT_EXECUTE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

/// Execute the `Task` tool: spawn a subagent, wait for it, return its output.
///
/// This is a blocking execution -- the subagent runs to completion before
/// returning the result to the caller. For true parallelism, multiple Task
/// tool calls in the same LLM turn will be executed concurrently by the
/// agent loop.
///
/// The wait is bounded by `SUBAGENT_EXECUTE_TIMEOUT`; if the subagent has not
/// finished by then, a failed (timeout) `ToolResult` is returned so the parent
/// agent's Task tool cannot hang the whole session indefinitely.
#[allow(dead_code)]
pub async fn execute_task(
    manager: &SubagentManager,
    description: &str,
    prompt: &str,
) -> crate::tools::ToolResult {
    match manager.spawn(description, prompt).await {
        Ok(id) => {
            let deadline = std::time::Instant::now() + SUBAGENT_EXECUTE_TIMEOUT;
            // Wait for this specific subagent to complete
            loop {
                let status = manager.get_status(&id).await;
                match status {
                    Some(SubagentStatus::Running) => {
                        if std::time::Instant::now() >= deadline {
                            // Signal cancellation so the spawned thread stops
                            // updating shared state, then surface a timeout.
                            let _ = manager.cancel(&id).await;
                            return crate::tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: false,
                                output: format!(
                                    "Subagent {} timed out after {}s and was cancelled.",
                                    id,
                                    SUBAGENT_EXECUTE_TIMEOUT.as_secs()
                                ),
                            };
                        }
                        // Brief yield to let the task make progress
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                    Some(SubagentStatus::Completed) => {
                        if let Some(result) = manager.get_result(&id).await {
                            let mut output = result.output;
                            if !result.files_modified.is_empty() {
                                output.push_str("\n\nFiles modified:\n");
                                for f in &result.files_modified {
                                    output.push_str(&format!("  - {}\n", f));
                                }
                            }
                            return crate::tools::ToolResult {
                                tool_name: "task".to_string(),
                                success: true,
                                output,
                            };
                        }
                        return crate::tools::ToolResult {
                            tool_name: "task".to_string(),
                            success: true,
                            output: format!("Subagent {} completed (no output captured).", id),
                        };
                    }
                    Some(SubagentStatus::Failed(msg)) => {
                        return crate::tools::ToolResult {
                            tool_name: "task".to_string(),
                            success: false,
                            output: format!("Subagent {} failed: {}", id, msg),
                        };
                    }
                    Some(SubagentStatus::Cancelled) => {
                        return crate::tools::ToolResult {
                            tool_name: "task".to_string(),
                            success: false,
                            output: format!("Subagent {} was cancelled.", id),
                        };
                    }
                    None => {
                        return crate::tools::ToolResult {
                            tool_name: "task".to_string(),
                            success: false,
                            output: format!("Subagent {} not found (internal error).", id),
                        };
                    }
                }
            }
        }
        Err(e) => crate::tools::ToolResult {
            tool_name: "task".to_string(),
            success: false,
            output: format!("Failed to spawn subagent: {:#}", e),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subagent_status_display() {
        assert_eq!(SubagentStatus::Running.to_string(), "running");
        assert_eq!(SubagentStatus::Completed.to_string(), "completed");
        assert_eq!(
            SubagentStatus::Failed("oops".to_string()).to_string(),
            "failed: oops"
        );
        assert_eq!(SubagentStatus::Cancelled.to_string(), "cancelled");
    }

    #[test]
    fn format_task_list_renders_state_and_empty() {
        assert!(format_task_list(&[]).contains("No subagent tasks"));

        let tasks = vec![
            (
                "task-1".to_string(),
                "refactor module".to_string(),
                SubagentStatus::Running,
            ),
            (
                "task-2".to_string(),
                String::new(),
                SubagentStatus::Failed("boom".to_string()),
            ),
        ];
        let out = format_task_list(&tasks);
        assert!(out.contains("Subagent tasks (2)"), "{out}");
        assert!(out.contains("task-1"), "{out}");
        assert!(out.contains("[running] refactor module"), "{out}");
        assert!(out.contains("[failed: boom]"), "{out}");
        assert!(out.contains("(no description)"), "{out}");
    }

    #[test]
    fn test_extract_modified_files_write() {
        let output = "Some output\nSuccessfully wrote 10 lines (200 bytes) to /tmp/foo.rs\nDone";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/foo.rs"]);
    }

    #[test]
    fn test_extract_modified_files_edit() {
        let output = "Successfully edited /tmp/bar.rs (replaced 1 occurrence)";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/bar.rs"]);
    }

    #[test]
    fn test_extract_modified_files_none() {
        let output = "Read file contents successfully.";
        let files = extract_modified_files(output);
        assert!(files.is_empty());
    }

    #[test]
    fn test_extract_modified_files_dedup() {
        let output = "Successfully wrote 5 lines (100 bytes) to /tmp/foo.rs\n\
                       Successfully wrote 3 lines (50 bytes) to /tmp/foo.rs";
        let files = extract_modified_files(output);
        assert_eq!(files, vec!["/tmp/foo.rs"]);
    }

    #[test]
    fn test_default_max_concurrent() {
        assert_eq!(DEFAULT_MAX_CONCURRENT, 7);
    }

    #[test]
    fn manager_refreshes_parent_authority_before_spawn() {
        let mut manager = SubagentManager::new(
            CliConfig::default(),
            "llama3".to_string(),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
        );

        manager.sync_parent_authority(
            "claude-sonnet-5".to_string(),
            true,
            crate::cli_options::PermissionMode::AcceptEdits,
            Some(vec!["read_file".to_string()]),
            vec!["web_fetch".to_string()],
        );

        assert_eq!(manager.model, "claude-sonnet-5");
        assert!(manager.skip_permissions);
        assert_eq!(
            manager.permission_mode,
            crate::cli_options::PermissionMode::AcceptEdits
        );
        assert_eq!(manager.allowed_tools, Some(vec!["read_file".to_string()]));
        assert_eq!(manager.disallowed_tools, vec!["web_fetch".to_string()]);
    }

    #[tokio::test]
    async fn manager_shutdown_cancels_and_joins_background_threads() {
        let manager = SubagentManager::new(
            CliConfig::default(),
            "llama3".to_string(),
            crate::context::gather_system_context(),
            false,
            crate::cli_options::PermissionMode::Default,
            None,
            Vec::new(),
        );
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let worker_cancelled = cancelled.clone();
        let handle = thread::spawn(move || {
            while !worker_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                thread::sleep(std::time::Duration::from_millis(5));
            }
        });
        manager.entries.write().await.insert(
            "subagent-test".to_string(),
            SubagentEntry {
                id: "subagent-test".to_string(),
                description: "shutdown sentinel".to_string(),
                status: Arc::new(RwLock::new(SubagentStatus::Running)),
                result: Arc::new(RwLock::new(None)),
                handle: Some(handle),
                cancelled: cancelled.clone(),
            },
        );

        manager.shutdown_all().await;

        assert!(cancelled.load(std::sync::atomic::Ordering::Acquire));
        let entries = manager.entries.read().await;
        let entry = entries.get("subagent-test").expect("tracked subagent");
        assert!(entry.handle.is_none());
        assert!(matches!(
            *entry.status.read().await,
            SubagentStatus::Cancelled
        ));
    }
}
