//! Hook executor for the UI hooks system.
//!
//! # Trust Model (Security)
//!
//! Hooks in this system are **user-authored only**, following the same trust model
//! as Claude Code hooks. Hook commands come exclusively from:
//!
//! 1. A YAML config file at `~/.agiworkforce/hooks.yaml` on the user's own machine
//! 2. The `hooks_add` / `hooks_update` Tauri commands (user action via frontend UI)
//! 3. The `hooks_import` Tauri command (user manually imports YAML)
//!
//! There is **no** path from marketplace downloads, plugins, or any untrusted source
//! to the hook system. The workflow marketplace deals exclusively with workflow
//! definitions and has zero hook integration.
//!
//! Despite the user-authored trust model, we apply a defensive blocklist against
//! clearly destructive commands (rm -rf /, fork bombs, etc.) to protect against
//! accidental paste errors or importing malicious YAML from untrusted sources.
//! Hook commands are passed to `sh -c` (or `cmd /C` on Windows), so the user
//! has the same power as running commands in their own terminal.

use super::types::{Hook, HookEvent, HookExecutionResult};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

/// Dangerous command patterns that are blocked even in user-authored hooks.
///
/// These represent clearly destructive operations that a user would almost never
/// intend to run as a hook. This is a defense-in-depth measure to catch accidental
/// paste errors or malicious YAML imports from untrusted sources.
const BLOCKED_HOOK_PATTERNS: &[&str] = &[
    // Destructive file system operations
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "sudo rm -rf",
    // Disk destruction
    "dd if=/dev/zero of=/dev/",
    "dd if=/dev/random of=/dev/",
    "mkfs.",
    // Fork bomb patterns
    ":(){ :|:& };:",
    ":(){:|:&};:",
    "bomb(){ bomb|bomb& };bomb",
    ".() { .|.& };.",
    // Remote code execution via pipe
    "curl | bash",
    "wget | bash",
    "curl|bash",
    "wget|bash",
    "curl | sh",
    "wget | sh",
    "curl|sh",
    "wget|sh",
    // System control commands
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    "init 0",
    "init 6",
    // Destructive redirects to system files/devices
    "> /dev/sda",
    "> /dev/hda",
    ">/dev/sda",
    ">/dev/hda",
    "> /etc/passwd",
    "> /etc/shadow",
    ">/etc/passwd",
    ">/etc/shadow",
    // Dangerous permission changes
    "chmod 777 /",
    "chmod -R 777 /",
    // Overwrite MBR
    "dd of=/dev/sda",
    "dd of=/dev/hda",
    "dd of=/dev/nvme",
];

/// Validate that a hook command does not contain clearly destructive patterns.
///
/// Returns `Ok(())` if the command passes validation, or an error describing
/// the blocked pattern.
fn validate_hook_command(command: &str) -> Result<()> {
    let cmd_lower = command.to_lowercase();
    let cmd_normalized = cmd_lower.replace(['\t', '\n', '\r'], " ");

    for pattern in BLOCKED_HOOK_PATTERNS {
        if cmd_normalized.contains(&pattern.to_lowercase()) {
            error!(
                "[HookExecutor] SECURITY: Blocked dangerous hook command pattern '{}' in: {}",
                pattern, command
            );
            return Err(anyhow::anyhow!(
                "Hook command blocked: contains dangerous pattern '{}'",
                pattern
            ));
        }
    }

    Ok(())
}

pub struct HookExecutor {
    hooks: tokio::sync::RwLock<Vec<Hook>>,
    execution_stats: tokio::sync::RwLock<HashMap<String, HookStats>>,
}

#[derive(Debug, Clone, Default)]
pub struct HookStats {
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub total_execution_time_ms: u64,
    pub last_execution: Option<chrono::DateTime<chrono::Utc>>,
}

impl HookExecutor {
    pub fn new() -> Self {
        Self {
            hooks: tokio::sync::RwLock::new(Vec::new()),
            execution_stats: tokio::sync::RwLock::new(HashMap::new()),
        }
    }

    pub async fn load_hooks(&self, hooks: Vec<Hook>) {
        let mut hook_list = self.hooks.write().await;

        // SECURITY: Filter out hooks with dangerous command patterns at load time.
        // Log warnings but don't fail the entire load for one bad hook.
        let mut safe_hooks = Vec::with_capacity(hooks.len());
        for hook in hooks {
            match validate_hook_command(&hook.command) {
                Ok(()) => safe_hooks.push(hook),
                Err(e) => {
                    warn!(
                        "Hook '{}' rejected during load: {}",
                        hook.name, e
                    );
                }
            }
        }

        *hook_list = safe_hooks;
        self.sort_hooks_by_priority(&mut hook_list);
        info!("Loaded {} hooks", hook_list.len());
    }

    pub async fn add_hook(&self, hook: Hook) -> Result<()> {
        // SECURITY: Validate command before registering the hook
        validate_hook_command(&hook.command)?;

        let mut hook_list = self.hooks.write().await;

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

    pub async fn remove_hook(&self, name: &str) -> Result<()> {
        let mut hook_list = self.hooks.write().await;
        let initial_len = hook_list.len();
        hook_list.retain(|h| h.name != name);

        if hook_list.len() == initial_len {
            return Err(anyhow::anyhow!("Hook '{}' not found", name));
        }

        Ok(())
    }

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

    pub async fn list_hooks(&self) -> Vec<Hook> {
        self.hooks.read().await.clone()
    }

    pub async fn get_stats(&self, hook_name: &str) -> Option<HookStats> {
        self.execution_stats.read().await.get(hook_name).cloned()
    }

    pub async fn execute_hooks(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        let hooks = self.hooks.read().await;
        let applicable_hooks: Vec<Hook> = hooks
            .iter()
            .filter(|h| h.handles_event(&event.event_type))
            .cloned()
            .collect();

        drop(hooks);

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

    async fn execute_single_hook(
        &self,
        hook: &Hook,
        event: &HookEvent,
    ) -> Result<HookExecutionResult> {
        let start_time = Instant::now();

        // SECURITY: Validate hook command against destructive pattern blocklist.
        // Hooks are user-authored (same trust model as Claude Code hooks), but
        // we still block clearly destructive patterns as defense-in-depth.
        validate_hook_command(&hook.command)?;

        let event_json = event.to_json().context("Failed to serialize event")?;

        let (shell, shell_arg) = if cfg!(windows) {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };

        let mut cmd = Command::new(shell);
        cmd.arg(shell_arg)
            .arg(&hook.command)
            .env("HOOK_EVENT_JSON", &event_json)
            .env("HOOK_EVENT_TYPE", event.event_type.as_str())
            .env("HOOK_SESSION_ID", &event.session_id)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(working_dir) = &hook.working_dir {
            cmd.current_dir(working_dir);
        }

        for (key, value) in &hook.env {
            cmd.env(key, value);
        }

        debug!("Executing hook '{}': {}", hook.name, hook.command);

        let timeout_duration = Duration::from_secs(hook.timeout_secs);
        let timeout_result = timeout(timeout_duration, async {
            let mut child = cmd.spawn().context("Failed to spawn hook process")?;

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

        self.update_stats(&hook.name, &result).await;

        Ok(result)
    }

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
    use crate::ui::hooks::types::HookEventType;

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
