use super::types::{Hook, HookEvent, HookEventType, HookExecutionResult};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

/// Hook executor - executes hooks in response to events
pub struct HookExecutor {
    hooks: tokio::sync::RwLock<Vec<Hook>>,
    execution_stats: tokio::sync::RwLock<HashMap<String, HookStats>>,
}

#[derive(Debug, Clone, Default)]
struct HookStats {
    total_executions: u64,
    successful_executions: u64,
    failed_executions: u64,
    total_execution_time_ms: u64,
    last_execution: Option<chrono::DateTime<chrono::Utc>>,
}

impl HookExecutor {
    /// Create a new hook executor
    pub fn new() -> Self {
        Self {
            hooks: tokio::sync::RwLock::new(Vec::new()),
            execution_stats: tokio::sync::RwLock::new(HashMap::new()),
        }
    }

    /// Load hooks from a list
    pub async fn load_hooks(&self, hooks: Vec<Hook>) {
        let mut hook_list = self.hooks.write().await;
        *hook_list = hooks;
        self.sort_hooks_by_priority(&mut hook_list);
        info!("Loaded {} hooks", hook_list.len());
    }

    /// Add a new hook
    pub async fn add_hook(&self, hook: Hook) -> Result<()> {
        let mut hook_list = self.hooks.write().await;

        // Check for duplicate names
        if hook_list.iter().any(|h| h.name == hook.name) {
            return Err(anyhow::anyhow!(
                "Hook with name '{}' already exists",
                hook.name
            ));
        }

        hook_list.push(hook);
        self.sort_hooks_by_priority(&mut hook_list);
        Ok(())
    }

    /// Remove a hook by name
    pub async fn remove_hook(&self, name: &str) -> Result<()> {
        let mut hook_list = self.hooks.write().await;
        let initial_len = hook_list.len();
        hook_list.retain(|h| h.name != name);

        if hook_list.len() == initial_len {
            return Err(anyhow::anyhow!("Hook '{}' not found", name));
        }

        Ok(())
    }

    /// Toggle a hook's enabled status
    pub async fn toggle_hook(&self, name: &str, enabled: bool) -> Result<()> {
        let mut hook_list = self.hooks.write().await;

        if let Some(hook) = hook_list.iter_mut().find(|h| h.name == name) {
            hook.enabled = enabled;
            info!(
                "Hook '{}' {} ",
                name,
                if enabled { "enabled" } else { "disabled" }
            );
            Ok(())
        } else {
            Err(anyhow::anyhow!("Hook '{}' not found", name))
        }
    }

    /// Get all hooks
    pub async fn list_hooks(&self) -> Vec<Hook> {
        self.hooks.read().await.clone()
    }

    /// Get execution stats for a hook
    pub async fn get_stats(&self, hook_name: &str) -> Option<HookStats> {
        self.execution_stats.read().await.get(hook_name).cloned()
    }

    /// Execute all hooks for a given event
    pub async fn execute_hooks(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        let hooks = self.hooks.read().await;
        let applicable_hooks: Vec<Hook> = hooks
            .iter()
            .filter(|h| h.handles_event(&event.event_type))
            .cloned()
            .collect();

        drop(hooks); // Release read lock

        if applicable_hooks.is_empty() {
            debug!("No hooks registered for event: {:?}", event.event_type);
            return Vec::new();
        }

        info!(
            "Executing {} hook(s) for event: {}",
            applicable_hooks.len(),
            event.event_type.as_str()
        );

        let mut results = Vec::new();

        for hook in applicable_hooks {
            match self.execute_single_hook(&hook, &event).await {
                Ok(result) => {
                    if result.success {
                        debug!("Hook '{}' succeeded", hook.name);
                    } else {
                        warn!(
                            "Hook '{}' failed with exit code: {:?}",
                            hook.name, result.exit_code
                        );
                    }
                    results.push(result);
                }
                Err(e) => {
                    error!("Failed to execute hook '{}': {}", hook.name, e);
                    results.push(HookExecutionResult {
                        hook_name: hook.name.clone(),
                        event_type: event.event_type.clone(),
                        success: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        execution_time_ms: 0,
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        results
    }

    /// Execute a single hook
    async fn execute_single_hook(
        &self,
        hook: &Hook,
        event: &HookEvent,
    ) -> Result<HookExecutionResult> {
        let start_time = Instant::now();

        // Prepare event JSON to pass as environment variable
        let event_json = event.to_json().context("Failed to serialize event")?;

        // Determine shell based on platform
        let (shell, shell_arg) = if cfg!(windows) {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };

        // Build command
        let mut cmd = Command::new(shell);
        cmd.arg(shell_arg)
            .arg(&hook.command)
            .env("HOOK_EVENT_JSON", &event_json)
            .env("HOOK_EVENT_TYPE", event.event_type.as_str())
            .env("HOOK_SESSION_ID", &event.session_id)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set working directory if specified
        if let Some(working_dir) = &hook.working_dir {
            cmd.current_dir(working_dir);
        }

        // Add custom environment variables
        for (key, value) in &hook.env {
            cmd.env(key, value);
        }

        debug!("Executing hook '{}': {}", hook.name, hook.command);

        // Execute with timeout
        let timeout_duration = Duration::from_secs(hook.timeout_secs);
        let timeout_result = timeout(timeout_duration, async {
            let mut child = cmd.spawn().context("Failed to spawn hook process")?;

            // Capture stdout and stderr concurrently
            let stdout_handle = child.stdout.take();
            let stderr_handle = child.stderr.take();

            let stdout_future = async {
                if let Some(stdout) = stdout_handle {
                    let mut reader = BufReader::new(stdout);
                    let mut output = String::new();
                    let mut line = String::new();
                    while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                        output.push_str(&line);
                        line.clear();
                    }
                    output
                } else {
                    String::new()
                }
            };

            let stderr_future = async {
                if let Some(stderr) = stderr_handle {
                    let mut reader = BufReader::new(stderr);
                    let mut output = String::new();
                    let mut line = String::new();
                    while reader.read_line(&mut line).await.unwrap_or(0) > 0 {
                        output.push_str(&line);
                        line.clear();
                    }
                    output
                } else {
                    String::new()
                }
            };

            let (stdout, stderr, status) = tokio::join!(stdout_future, stderr_future, child.wait());

            let status = status.context("Failed to wait for child process")?;

            Ok::<_, anyhow::Error>((stdout, stderr, status))
        })
        .await;

        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        let result = match timeout_result {
            Ok(Ok((stdout, stderr, status))) => {
                let success = status.success();
                let exit_code = status.code();

                HookExecutionResult {
                    hook_name: hook.name.clone(),
                    event_type: event.event_type.clone(),
                    success,
                    exit_code,
                    stdout,
                    stderr,
                    execution_time_ms,
                    error: None,
                }
            }
            Ok(Err(e)) => HookExecutionResult {
                hook_name: hook.name.clone(),
                event_type: event.event_type.clone(),
                success: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                execution_time_ms,
                error: Some(e.to_string()),
            },
            Err(_) => HookExecutionResult {
                hook_name: hook.name.clone(),
                event_type: event.event_type.clone(),
                success: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                execution_time_ms,
                error: Some(format!(
                    "Hook timed out after {} seconds",
                    hook.timeout_secs
                )),
            },
        };

        // Update statistics
        self.update_stats(&hook.name, &result).await;

        Ok(result)
    }

    /// Update execution statistics
    async fn update_stats(&self, hook_name: &str, result: &HookExecutionResult) {
        let mut stats = self.execution_stats.write().await;
        let entry = stats.entry(hook_name.to_string()).or_default();

        entry.total_executions += 1;
        if result.success {
            entry.successful_executions += 1;
        } else {
            entry.failed_executions += 1;
        }
        entry.total_execution_time_ms += result.execution_time_ms;
        entry.last_execution = Some(chrono::Utc::now());
    }

    /// Sort hooks by priority (lower number = higher priority)
    fn sort_hooks_by_priority(&self, hooks: &mut [Hook]) {
        hooks.sort_by_key(|h| h.priority);
    }
}

impl Default for HookExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_add_remove_hook() {
        let executor = HookExecutor::new();

        let hook = Hook {
            name: "test_hook".to_string(),
            events: vec![HookEventType::SessionStart],
            priority: 50,
            command: "echo test".to_string(),
            enabled: true,
            timeout_secs: 30,
            env: HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        };

        executor.add_hook(hook.clone()).await.unwrap();
        assert_eq!(executor.list_hooks().await.len(), 1);

        executor.remove_hook("test_hook").await.unwrap();
        assert_eq!(executor.list_hooks().await.len(), 0);
    }

    #[tokio::test]
    async fn test_toggle_hook() {
        let executor = HookExecutor::new();

        let hook = Hook {
            name: "test_hook".to_string(),
            events: vec![HookEventType::SessionStart],
            priority: 50,
            command: "echo test".to_string(),
            enabled: true,
            timeout_secs: 30,
            env: HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        };

        executor.add_hook(hook).await.unwrap();
        executor.toggle_hook("test_hook", false).await.unwrap();

        let hooks = executor.list_hooks().await;
        assert!(!hooks[0].enabled);
    }
}
