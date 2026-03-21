use std::collections::HashMap;
use std::sync::Arc;
use std::thread;

use anyhow::{bail, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::CliConfig;
use crate::context::SystemContext;

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

/// Manages concurrent subagent tasks spawned via the `Task` tool.
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
}

impl SubagentManager {
    /// Create a new subagent manager.
    pub fn new(
        config: CliConfig,
        model: String,
        sys_context: SystemContext,
        skip_permissions: bool,
    ) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: DEFAULT_MAX_CONCURRENT,
            next_id: Arc::new(RwLock::new(1)),
            config,
            model,
            sys_context,
            skip_permissions,
        }
    }

    /// Spawn a new subagent task. Returns the subagent ID.
    pub async fn spawn(&self, description: &str, prompt: &str) -> Result<String> {
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
        let task_config = self.config.clone();
        let task_model = self.model.clone();
        let task_sys_context = self.sys_context.clone();
        let task_skip_permissions = self.skip_permissions;
        let task_status = Arc::clone(&status);
        let task_result = Arc::clone(&result);
        let task_cancelled = Arc::clone(&cancelled);
        let task_description = description.to_string();

        eprintln!(
            "  {} Spawning subagent {} — {}",
            "[task]".cyan().bold(),
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

                rt.block_on(async move {
                    // Check cancellation before starting
                    if task_cancelled.load(std::sync::atomic::Ordering::Acquire) {
                        *task_status.write().await = SubagentStatus::Cancelled;
                        return;
                    }

                    let outcome = run_subagent(
                        &task_config,
                        &task_model,
                        &task_sys_context,
                        &task_prompt,
                        task_skip_permissions,
                    )
                    .await;

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
                                "[task]".green().bold(),
                                task_id.bold()
                            );
                        }
                        Err(e) => {
                            let err_msg = format!("{:#}", e);
                            *task_status.write().await = SubagentStatus::Failed(err_msg.clone());

                            eprintln!(
                                "  {} Subagent {} failed: {}",
                                "[task]".red().bold(),
                                task_id.bold(),
                                err_msg.dimmed()
                            );
                        }
                    }
                });
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
                    "[task]".yellow().bold(),
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
                    "[task]".red().bold(),
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
                SubagentStatus::Running => "running".yellow().to_string(),
                SubagentStatus::Completed => "completed".green().to_string(),
                SubagentStatus::Failed(msg) => format!("{}: {}", "failed".red(), msg),
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
    config: &CliConfig,
    model: &str,
    sys_context: &SystemContext,
    prompt: &str,
    skip_permissions: bool,
) -> Result<String> {
    let mut session = crate::agent::AgentSession::new(model, sys_context, None);
    session.skip_permissions = skip_permissions;
    // Subagents get a reasonable max turns to avoid runaway loops
    session.max_turns = Some(15);

    let result = session
        .send(
            config,
            prompt,
            Box::new(|_chunk| {
                // Subagent output is collected silently -- not streamed to terminal.
                // The parent agent receives the full result.
            }),
        )
        .await?;

    Ok(result.response)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Heuristically extract file paths that appear to have been modified,
/// based on common tool output patterns (write_file, edit_file results).
fn extract_modified_files(output: &str) -> Vec<String> {
    let mut files = Vec::new();

    // Match patterns like "Successfully wrote ... to /path/to/file"
    // and "Successfully edited /path/to/file"
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

/// Execute the `Task` tool: spawn a subagent, wait for it, return its output.
///
/// This is a blocking execution -- the subagent runs to completion before
/// returning the result to the caller. For true parallelism, multiple Task
/// tool calls in the same LLM turn will be executed concurrently by the
/// agent loop.
#[allow(dead_code)]
pub async fn execute_task(
    manager: &SubagentManager,
    description: &str,
    prompt: &str,
) -> crate::tools::ToolResult {
    match manager.spawn(description, prompt).await {
        Ok(id) => {
            // Wait for this specific subagent to complete
            loop {
                let status = manager.get_status(&id).await;
                match status {
                    Some(SubagentStatus::Running) => {
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
}
