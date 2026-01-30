//! Hook executor implementation.
//!
//! Executes hook commands in response to lifecycle events. Commands are run
//! via the system shell with hook context provided as environment variables.

use super::config::{HookDefinition, HooksConfig};
use super::error::{HookError, HookResult};
use super::event::{HookContext, HookEvent};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::Semaphore;

/// Maximum number of concurrent hook executions.
const MAX_CONCURRENT_HOOKS: usize = 10;

/// Maximum output size to capture from hook commands (64KB).
const MAX_OUTPUT_SIZE: usize = 65536;

/// Environment variable prefix for hook context.
const ENV_PREFIX: &str = "AGI_HOOK_";

/// Result of a single hook execution.
#[derive(Debug, Clone)]
pub struct HookExecutionResult {
    /// The hook command that was executed.
    pub command: String,

    /// Whether the execution was successful (exit code 0).
    pub success: bool,

    /// Exit code from the process.
    pub exit_code: Option<i32>,

    /// Standard output (truncated to MAX_OUTPUT_SIZE).
    pub stdout: String,

    /// Standard error (truncated to MAX_OUTPUT_SIZE).
    pub stderr: String,

    /// Execution duration in milliseconds.
    pub duration_ms: u64,

    /// Error message if execution failed.
    pub error: Option<String>,
}

/// Statistics for hook executions.
#[derive(Debug, Default)]
pub struct HookStats {
    /// Total number of hook executions.
    pub total_executions: AtomicU64,

    /// Number of successful executions.
    pub successful_executions: AtomicU64,

    /// Number of failed executions.
    pub failed_executions: AtomicU64,

    /// Number of timed-out executions.
    pub timed_out_executions: AtomicU64,

    /// Total execution time in milliseconds.
    pub total_duration_ms: AtomicU64,
}

impl HookStats {
    /// Create new stats tracker.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a successful execution.
    pub fn record_success(&self, duration_ms: u64) {
        self.total_executions.fetch_add(1, Ordering::Relaxed);
        self.successful_executions.fetch_add(1, Ordering::Relaxed);
        self.total_duration_ms
            .fetch_add(duration_ms, Ordering::Relaxed);
    }

    /// Record a failed execution.
    pub fn record_failure(&self, duration_ms: u64) {
        self.total_executions.fetch_add(1, Ordering::Relaxed);
        self.failed_executions.fetch_add(1, Ordering::Relaxed);
        self.total_duration_ms
            .fetch_add(duration_ms, Ordering::Relaxed);
    }

    /// Record a timed-out execution.
    pub fn record_timeout(&self, duration_ms: u64) {
        self.total_executions.fetch_add(1, Ordering::Relaxed);
        self.timed_out_executions.fetch_add(1, Ordering::Relaxed);
        self.total_duration_ms
            .fetch_add(duration_ms, Ordering::Relaxed);
    }

    /// Get total executions count.
    #[must_use]
    pub fn total(&self) -> u64 {
        self.total_executions.load(Ordering::Relaxed)
    }

    /// Get successful executions count.
    #[must_use]
    pub fn successful(&self) -> u64 {
        self.successful_executions.load(Ordering::Relaxed)
    }

    /// Get failed executions count.
    #[must_use]
    pub fn failed(&self) -> u64 {
        self.failed_executions.load(Ordering::Relaxed)
    }

    /// Get timed-out executions count.
    #[must_use]
    pub fn timed_out(&self) -> u64 {
        self.timed_out_executions.load(Ordering::Relaxed)
    }

    /// Get average duration in milliseconds.
    #[must_use]
    pub fn avg_duration_ms(&self) -> f64 {
        let total = self.total();
        if total == 0 {
            0.0
        } else {
            self.total_duration_ms.load(Ordering::Relaxed) as f64 / total as f64
        }
    }
}

/// Executor for running hook commands.
///
/// The executor manages hook configuration, runs commands with proper context,
/// handles timeouts, and tracks execution statistics.
pub struct HookExecutor {
    /// Current hooks configuration.
    config: Arc<RwLock<HooksConfig>>,

    /// Working directory for hook commands.
    working_dir: Arc<RwLock<Option<PathBuf>>>,

    /// Whether hook execution is enabled.
    enabled: AtomicBool,

    /// Semaphore to limit concurrent hook executions.
    semaphore: Arc<Semaphore>,

    /// Execution statistics.
    stats: Arc<HookStats>,
}

impl HookExecutor {
    /// Create a new hook executor with the given configuration.
    #[must_use]
    pub fn new(config: HooksConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            working_dir: Arc::new(RwLock::new(None)),
            enabled: AtomicBool::new(true),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_HOOKS)),
            stats: Arc::new(HookStats::new()),
        }
    }

    /// Create a new hook executor with default (empty) configuration.
    #[must_use]
    pub fn default() -> Self {
        Self::new(HooksConfig::new())
    }

    /// Update the hooks configuration.
    pub fn set_config(&self, config: HooksConfig) {
        *self.config.write() = config;
    }

    /// Get a clone of the current configuration.
    #[must_use]
    pub fn get_config(&self) -> HooksConfig {
        self.config.read().clone()
    }

    /// Set the working directory for hook commands.
    pub fn set_working_dir(&self, path: Option<PathBuf>) {
        *self.working_dir.write() = path;
    }

    /// Get the current working directory.
    #[must_use]
    pub fn get_working_dir(&self) -> Option<PathBuf> {
        self.working_dir.read().clone()
    }

    /// Enable or disable hook execution.
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    /// Check if hook execution is enabled.
    #[must_use]
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    /// Get execution statistics.
    #[must_use]
    pub fn stats(&self) -> &HookStats {
        &self.stats
    }

    /// Check if any hooks are configured for an event.
    #[must_use]
    pub fn has_hooks(&self, event: HookEvent) -> bool {
        self.config.read().has_hooks(event)
    }

    /// Fire a hook event with the given context.
    ///
    /// This is the main entry point for triggering hooks. It:
    /// 1. Checks if hooks are enabled
    /// 2. Finds matching hooks for the event
    /// 3. Executes hooks (concurrently for non-blocking events)
    /// 4. Returns results from all executed hooks
    ///
    /// # Arguments
    /// - `context`: The hook context with event data
    ///
    /// # Returns
    /// Results from all executed hooks. For blocking events, hooks are run
    /// sequentially and any failure stops execution. For non-blocking events,
    /// all hooks are run concurrently.
    ///
    /// # Errors
    /// Returns error if hook execution is disabled or matcher patterns are invalid.
    pub async fn fire(&self, context: &HookContext) -> HookResult<Vec<HookExecutionResult>> {
        if !self.is_enabled() {
            return Err(HookError::Disabled("Hook execution is disabled".into()));
        }

        let tool_name = context.tool_name.as_deref();
        let hooks = {
            let config = self.config.read();
            config
                .get_matching_hooks(context.event, tool_name)?
                .into_iter()
                .map(|h| h.clone())
                .collect::<Vec<_>>()
        };

        if hooks.is_empty() {
            return Ok(vec![]);
        }

        let working_dir = self.get_working_dir();
        let env_vars = self.build_env_vars(context)?;

        if context.event.is_blocking() {
            // Run blocking hooks sequentially
            self.run_hooks_sequential(&hooks, &env_vars, working_dir.as_ref())
                .await
        } else {
            // Run non-blocking hooks concurrently
            self.run_hooks_concurrent(&hooks, &env_vars, working_dir.as_ref())
                .await
        }
    }

    /// Fire a hook event without waiting for completion.
    ///
    /// Spawns hook execution in a background task. Useful for events
    /// where hook results are not needed and shouldn't block the main flow.
    ///
    /// # Arguments
    /// - `context`: The hook context with event data
    pub fn fire_and_forget(&self, context: HookContext) {
        if !self.is_enabled() {
            return;
        }

        let executor = self.clone_for_spawn();
        tokio::spawn(async move {
            if let Err(e) = executor.fire(&context).await {
                tracing::warn!("Hook execution failed: {}", e);
            }
        });
    }

    /// Execute hooks sequentially (for blocking events).
    async fn run_hooks_sequential(
        &self,
        hooks: &[HookDefinition],
        env_vars: &HashMap<String, String>,
        working_dir: Option<&PathBuf>,
    ) -> HookResult<Vec<HookExecutionResult>> {
        let mut results = Vec::with_capacity(hooks.len());

        for hook in hooks {
            let result = self.execute_hook(hook, env_vars, working_dir).await?;
            let success = result.success;
            results.push(result);

            // Stop on first failure for blocking events
            if !success {
                break;
            }
        }

        Ok(results)
    }

    /// Execute hooks concurrently (for non-blocking events).
    async fn run_hooks_concurrent(
        &self,
        hooks: &[HookDefinition],
        env_vars: &HashMap<String, String>,
        working_dir: Option<&PathBuf>,
    ) -> HookResult<Vec<HookExecutionResult>> {
        let futures: Vec<_> = hooks
            .iter()
            .map(|hook| self.execute_hook(hook, env_vars, working_dir))
            .collect();

        let results = futures::future::join_all(futures).await;

        // Collect results, logging any errors but not failing
        Ok(results
            .into_iter()
            .filter_map(|r| match r {
                Ok(result) => Some(result),
                Err(e) => {
                    tracing::warn!("Hook execution error: {}", e);
                    None
                }
            })
            .collect())
    }

    /// Execute a single hook command.
    async fn execute_hook(
        &self,
        hook: &HookDefinition,
        env_vars: &HashMap<String, String>,
        working_dir: Option<&PathBuf>,
    ) -> HookResult<HookExecutionResult> {
        // Acquire semaphore permit to limit concurrency
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| HookError::ExecutionFailed {
                event: "unknown".to_string(),
                reason: "Failed to acquire execution permit".to_string(),
            })?;

        let start = Instant::now();
        let timeout = hook.timeout();

        // Build the command
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(["/C", &hook.command]);
            c
        } else {
            let mut c = Command::new("sh");
            c.args(["-c", &hook.command]);
            c
        };

        // Set working directory if specified
        if let Some(dir) = working_dir {
            if dir.exists() && dir.is_dir() {
                cmd.current_dir(dir);
            } else {
                return Err(HookError::InvalidWorkingDirectory {
                    path: dir.display().to_string(),
                    reason: "Directory does not exist or is not a directory".to_string(),
                });
            }
        }

        // Set environment variables
        cmd.envs(env_vars);

        // Configure stdio
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Spawn the process
        let mut child = cmd.spawn()?;

        // Read output with timeout
        let result = tokio::time::timeout(timeout, async {
            let mut stdout = String::new();
            let mut stderr = String::new();

            if let Some(mut stdout_handle) = child.stdout.take() {
                let mut buf = vec![0u8; MAX_OUTPUT_SIZE];
                match stdout_handle.read(&mut buf).await {
                    Ok(n) => stdout = String::from_utf8_lossy(&buf[..n]).to_string(),
                    Err(e) => tracing::debug!("Failed to read stdout: {}", e),
                }
            }

            if let Some(mut stderr_handle) = child.stderr.take() {
                let mut buf = vec![0u8; MAX_OUTPUT_SIZE];
                match stderr_handle.read(&mut buf).await {
                    Ok(n) => stderr = String::from_utf8_lossy(&buf[..n]).to_string(),
                    Err(e) => tracing::debug!("Failed to read stderr: {}", e),
                }
            }

            let status = child.wait().await?;
            Ok::<_, std::io::Error>((status, stdout, stderr))
        })
        .await;

        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok(Ok((status, stdout, stderr))) => {
                let success = status.success();
                let exit_code = status.code();

                if success {
                    self.stats.record_success(duration_ms);
                } else {
                    self.stats.record_failure(duration_ms);
                }

                Ok(HookExecutionResult {
                    command: hook.command.clone(),
                    success,
                    exit_code,
                    stdout,
                    stderr,
                    duration_ms,
                    error: if success {
                        None
                    } else {
                        Some(format!("Exit code: {:?}", exit_code))
                    },
                })
            }
            Ok(Err(e)) => {
                self.stats.record_failure(duration_ms);
                Ok(HookExecutionResult {
                    command: hook.command.clone(),
                    success: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    duration_ms,
                    error: Some(e.to_string()),
                })
            }
            Err(_) => {
                // Timeout - kill the process
                let _ = child.kill().await;
                self.stats.record_timeout(duration_ms);

                Err(HookError::Timeout {
                    command: hook.command.clone(),
                    timeout_ms: timeout.as_millis() as u64,
                })
            }
        }
    }

    /// Build environment variables from hook context.
    fn build_env_vars(&self, context: &HookContext) -> HookResult<HashMap<String, String>> {
        let mut env = HashMap::new();

        // Event info
        env.insert(
            format!("{}EVENT", ENV_PREFIX),
            context.event.as_str().to_string(),
        );
        env.insert(
            format!("{}TIMESTAMP_MS", ENV_PREFIX),
            context.timestamp_ms.to_string(),
        );

        // Session info
        if let Some(ref session_id) = context.session_id {
            env.insert(format!("{}SESSION_ID", ENV_PREFIX), session_id.clone());
        }

        // Tool info
        if let Some(ref tool_name) = context.tool_name {
            env.insert(format!("{}TOOL_NAME", ENV_PREFIX), tool_name.clone());
        }
        if let Some(ref tool_id) = context.tool_id {
            env.insert(format!("{}TOOL_ID", ENV_PREFIX), tool_id.clone());
        }
        if let Some(ref args) = context.tool_arguments {
            env.insert(
                format!("{}TOOL_ARGUMENTS", ENV_PREFIX),
                serde_json::to_string(args)?,
            );
        }
        if let Some(ref result) = context.tool_result {
            env.insert(
                format!("{}TOOL_RESULT", ENV_PREFIX),
                serde_json::to_string(result)?,
            );
        }

        // Error info
        if let Some(ref error) = context.error {
            env.insert(format!("{}ERROR", ENV_PREFIX), error.clone());
        }

        // Duration
        if let Some(duration) = context.duration_ms {
            env.insert(format!("{}DURATION_MS", ENV_PREFIX), duration.to_string());
        }

        // Agent info
        if let Some(ref agent_id) = context.agent_id {
            env.insert(format!("{}AGENT_ID", ENV_PREFIX), agent_id.clone());
        }

        // Reason
        if let Some(ref reason) = context.reason {
            env.insert(format!("{}REASON", ENV_PREFIX), reason.clone());
        }

        // Prompt (truncated in context already)
        if let Some(ref prompt) = context.prompt {
            env.insert(format!("{}PROMPT", ENV_PREFIX), prompt.clone());
        }

        // Permission info
        if let Some(ref perm_type) = context.permission_type {
            env.insert(format!("{}PERMISSION_TYPE", ENV_PREFIX), perm_type.clone());
        }
        if let Some(ref resource) = context.resource {
            env.insert(format!("{}RESOURCE", ENV_PREFIX), resource.clone());
        }

        // Notification info
        if let Some(ref notif_type) = context.notification_type {
            env.insert(
                format!("{}NOTIFICATION_TYPE", ENV_PREFIX),
                notif_type.clone(),
            );
        }
        if let Some(ref title) = context.notification_title {
            env.insert(format!("{}NOTIFICATION_TITLE", ENV_PREFIX), title.clone());
        }
        if let Some(ref body) = context.notification_body {
            env.insert(format!("{}NOTIFICATION_BODY", ENV_PREFIX), body.clone());
        }

        // Compaction info
        if let Some(token_count) = context.token_count {
            env.insert(
                format!("{}TOKEN_COUNT", ENV_PREFIX),
                token_count.to_string(),
            );
        }
        if let Some(ref strategy) = context.compaction_strategy {
            env.insert(
                format!("{}COMPACTION_STRATEGY", ENV_PREFIX),
                strategy.clone(),
            );
        }

        // Full context as JSON
        env.insert(format!("{}CONTEXT_JSON", ENV_PREFIX), context.to_json()?);

        // Metadata
        for (key, value) in &context.metadata {
            let env_key = format!(
                "{}META_{}",
                ENV_PREFIX,
                key.to_uppercase().replace('-', "_")
            );
            env.insert(env_key, value.clone());
        }

        Ok(env)
    }

    /// Create a clone of executor state suitable for spawning background tasks.
    fn clone_for_spawn(&self) -> Self {
        Self {
            config: self.config.clone(),
            working_dir: self.working_dir.clone(),
            enabled: AtomicBool::new(self.is_enabled()),
            semaphore: self.semaphore.clone(),
            stats: self.stats.clone(),
        }
    }
}

impl Clone for HookExecutor {
    fn clone(&self) -> Self {
        self.clone_for_spawn()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::hooks::config::{HookEntry, HooksConfig};

    fn create_test_config() -> HooksConfig {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("echo 'session started'")]),
        );
        config.add_hook(
            HookEvent::PostToolUse,
            HookEntry::with_matcher(
                "Write|Edit",
                vec![HookDefinition::new("echo 'tool used: $AGI_HOOK_TOOL_NAME'")],
            ),
        );
        config
    }

    #[test]
    fn test_executor_creation() {
        let executor = HookExecutor::new(create_test_config());
        assert!(executor.is_enabled());
        assert!(executor.has_hooks(HookEvent::SessionStart));
        assert!(executor.has_hooks(HookEvent::PostToolUse));
        assert!(!executor.has_hooks(HookEvent::SessionEnd));
    }

    #[test]
    fn test_executor_enable_disable() {
        let executor = HookExecutor::default();
        assert!(executor.is_enabled());

        executor.set_enabled(false);
        assert!(!executor.is_enabled());

        executor.set_enabled(true);
        assert!(executor.is_enabled());
    }

    #[test]
    fn test_executor_working_dir() {
        let executor = HookExecutor::default();
        assert!(executor.get_working_dir().is_none());

        let path = PathBuf::from("/tmp");
        executor.set_working_dir(Some(path.clone()));
        assert_eq!(executor.get_working_dir(), Some(path));

        executor.set_working_dir(None);
        assert!(executor.get_working_dir().is_none());
    }

    #[test]
    fn test_executor_config_update() {
        let executor = HookExecutor::default();
        assert!(!executor.has_hooks(HookEvent::SessionStart));

        executor.set_config(create_test_config());
        assert!(executor.has_hooks(HookEvent::SessionStart));
    }

    #[test]
    fn test_build_env_vars() {
        let executor = HookExecutor::default();
        let context = HookContext::new(HookEvent::PostToolUse)
            .with_session_id("test-session")
            .with_tool("Write", "mcp__fs__write")
            .with_duration_ms(100)
            .with_metadata("file", "/tmp/test.txt");

        let env = executor.build_env_vars(&context).unwrap();

        assert_eq!(env.get("AGI_HOOK_EVENT"), Some(&"PostToolUse".to_string()));
        assert_eq!(
            env.get("AGI_HOOK_SESSION_ID"),
            Some(&"test-session".to_string())
        );
        assert_eq!(env.get("AGI_HOOK_TOOL_NAME"), Some(&"Write".to_string()));
        assert_eq!(
            env.get("AGI_HOOK_TOOL_ID"),
            Some(&"mcp__fs__write".to_string())
        );
        assert_eq!(env.get("AGI_HOOK_DURATION_MS"), Some(&"100".to_string()));
        assert_eq!(
            env.get("AGI_HOOK_META_FILE"),
            Some(&"/tmp/test.txt".to_string())
        );
        assert!(env.get("AGI_HOOK_CONTEXT_JSON").is_some());
    }

    #[tokio::test]
    async fn test_fire_disabled() {
        let executor = HookExecutor::new(create_test_config());
        executor.set_enabled(false);

        let context = HookContext::new(HookEvent::SessionStart);
        let result = executor.fire(&context).await;

        assert!(matches!(result, Err(HookError::Disabled(_))));
    }

    #[tokio::test]
    async fn test_fire_no_matching_hooks() {
        let executor = HookExecutor::new(create_test_config());
        let context = HookContext::new(HookEvent::SessionEnd);

        let results = executor.fire(&context).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_fire_session_start() {
        let executor = HookExecutor::new(create_test_config());
        let context = HookContext::new(HookEvent::SessionStart).with_session_id("test-123");

        let results = executor.fire(&context).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].success);
        assert!(results[0].stdout.contains("session started"));
    }

    #[tokio::test]
    async fn test_fire_with_matcher() {
        let executor = HookExecutor::new(create_test_config());

        // Write matches
        let context = HookContext::new(HookEvent::PostToolUse).with_tool("Write", "mcp__fs__write");
        let results = executor.fire(&context).await.unwrap();
        assert_eq!(results.len(), 1);

        // Read doesn't match
        let context = HookContext::new(HookEvent::PostToolUse).with_tool("Read", "mcp__fs__read");
        let results = executor.fire(&context).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_fire_command_failure() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("exit 1")]),
        );

        let executor = HookExecutor::new(config);
        let context = HookContext::new(HookEvent::SessionStart);

        let results = executor.fire(&context).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert_eq!(results[0].exit_code, Some(1));
    }

    #[tokio::test]
    async fn test_stats_tracking() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![
                HookDefinition::new("echo success"),
                HookDefinition::new("exit 1"),
            ]),
        );

        let executor = HookExecutor::new(config);

        // Run hooks (SessionStart is not blocking, so both run)
        let context = HookContext::new(HookEvent::SessionStart);
        let _ = executor.fire(&context).await;

        let stats = executor.stats();
        assert_eq!(stats.total(), 2);
        assert_eq!(stats.successful(), 1);
        assert_eq!(stats.failed(), 1);
    }

    #[tokio::test]
    async fn test_fire_timeout() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionStart,
            HookEntry::new(vec![HookDefinition::new("sleep 10").with_timeout_ms(100)]),
        );

        let executor = HookExecutor::new(config);
        let context = HookContext::new(HookEvent::SessionStart);

        let result = executor.fire(&context).await;

        // The first hook times out
        assert!(matches!(result, Err(HookError::Timeout { .. })));

        let stats = executor.stats();
        assert_eq!(stats.timed_out(), 1);
    }

    #[tokio::test]
    async fn test_fire_and_forget() {
        let mut config = HooksConfig::new();
        config.add_hook(
            HookEvent::SessionEnd,
            HookEntry::new(vec![HookDefinition::new("echo 'goodbye'")]),
        );

        let executor = HookExecutor::new(config);
        let context = HookContext::new(HookEvent::SessionEnd);

        // This should not block
        executor.fire_and_forget(context);

        // Give the background task time to run
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check stats were updated
        assert!(executor.stats().total() >= 1);
    }

    #[test]
    fn test_hook_execution_result() {
        let result = HookExecutionResult {
            command: "echo test".to_string(),
            success: true,
            exit_code: Some(0),
            stdout: "test\n".to_string(),
            stderr: String::new(),
            duration_ms: 50,
            error: None,
        };

        assert!(result.success);
        assert_eq!(result.exit_code, Some(0));
        assert_eq!(result.stdout, "test\n");
    }
}
