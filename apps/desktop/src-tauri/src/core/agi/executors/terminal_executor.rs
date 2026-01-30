//! Terminal command executor.
//!
//! Handles shell command execution with comprehensive security controls
//! to prevent dangerous operations. Supports multiple shell types including
//! bash, zsh, sh on Unix and PowerShell, cmd on Windows.
//!
//! # Security
//!
//! This executor implements a comprehensive blocklist of dangerous command
//! patterns and validates working directories to prevent:
//! - Destructive file system operations (rm -rf /, etc.)
//! - Fork bombs and resource exhaustion
//! - Remote code execution via piped commands
//! - System shutdown/reboot commands
//! - Dangerous permission changes
//!
//! # Streaming
//!
//! Output is streamed via Tauri events for real-time display in the UI.
//! Both stdout and stderr are captured and emitted as tool stream events.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::ui::events::frontend_events::{emit_terminal_command, TerminalCommand};
use crate::ui::events::tool_stream::{emit_tool_output_chunk, emit_tool_progress, OutputChunkType};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Maximum stdout output in bytes (10MB).
const MAX_STDOUT_BYTES: usize = 10 * 1024 * 1024;

/// Maximum stderr output in bytes (1MB).
const MAX_STDERR_BYTES: usize = 1024 * 1024;

/// Default command timeout in milliseconds (60 seconds).
const DEFAULT_TIMEOUT_MS: u64 = 60_000;

/// Maximum command timeout in milliseconds (5 minutes).
const MAX_TIMEOUT_MS: u64 = 300_000;

/// Executor for terminal command operations.
///
/// Executes shell commands with security controls, timeout handling,
/// and streaming output support.
pub struct TerminalExecutor;

impl TerminalExecutor {
    /// Create a new terminal executor.
    pub fn new() -> Self {
        Self
    }

    /// Security blocklist: patterns that are NEVER allowed.
    ///
    /// These represent destructive, dangerous, or potentially malicious commands
    /// that should be blocked regardless of context.
    const BLOCKED_PATTERNS: &'static [&'static str] = &[
        // Destructive file system operations
        "rm -rf /",
        "rm -rf /*",
        "rm -rf ~",
        "sudo rm -rf",
        // Disk destruction
        "dd if=/dev/zero of=/dev/",
        "dd if=/dev/random of=/dev/",
        "mkfs.",
        "format c:",
        // Fork bomb patterns
        ":(){ :|:& };:",
        ":(){:|:&};:",
        // Remote code execution via pipe
        "curl | bash",
        "wget | bash",
        "curl|bash",
        "wget|bash",
        "curl | sh",
        "wget | sh",
        "curl|sh",
        "wget|sh",
        "| sh",
        "| bash",
        "| zsh",
        "|sh",
        "|bash",
        "|zsh",
        "base64 -d | sh",
        "base64 -d | bash",
        "base64 -d|sh",
        "base64 -d|bash",
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
        "> /dev/nvme",
        ">/dev/sda",
        ">/dev/hda",
        ">/dev/nvme",
        "> /etc/passwd",
        "> /etc/shadow",
        ">/etc/passwd",
        ">/etc/shadow",
        // Dangerous permission changes
        "chmod 777 /",
        "chmod -R 777 /",
        "chmod 777 /*",
        "chown -R root /",
        // Kernel manipulation
        "insmod",
        "rmmod",
        "modprobe -r",
        // Network security bypass
        "iptables -F",
        "iptables --flush",
        // History manipulation (potential evasion)
        "history -c",
        "export HISTSIZE=0",
        // Windows-specific destructive commands
        "del /f /s /q c:\\",
        "rd /s /q c:\\",
        "format c: /y",
    ];

    /// Additional blocked command prefixes for extra safety.
    const BLOCKED_PREFIXES: &'static [&'static str] = &["sudo dd ", "sudo mkfs", "sudo rm -rf /"];

    /// Validate a command against the security blocklist.
    ///
    /// # Arguments
    ///
    /// * `command` - The command string to validate
    ///
    /// # Returns
    ///
    /// `Ok(())` if the command is safe, or an error if blocked.
    fn validate_command(&self, command: &str) -> Result<()> {
        let cmd_lower = command.to_lowercase();
        let cmd_normalized = cmd_lower.replace(['\t', '\n', '\r'], " ");

        for pattern in Self::BLOCKED_PATTERNS {
            if cmd_normalized.contains(&pattern.to_lowercase()) {
                tracing::error!(
                    "[TerminalExecutor] SECURITY: Blocked dangerous command pattern '{}' in command: {}",
                    pattern,
                    command
                );
                return Err(anyhow!(
                    "Command blocked for security: contains dangerous pattern"
                ));
            }
        }

        for prefix in Self::BLOCKED_PREFIXES {
            if cmd_normalized.starts_with(&prefix.to_lowercase()) {
                tracing::error!(
                    "[TerminalExecutor] SECURITY: Blocked dangerous command prefix '{}' in command: {}",
                    prefix,
                    command
                );
                return Err(anyhow!(
                    "Command blocked for security: starts with dangerous pattern"
                ));
            }
        }

        Ok(())
    }

    /// Validate and canonicalize the working directory.
    ///
    /// # Arguments
    ///
    /// * `dir` - The directory path to validate
    /// * `context` - The executor context for accessing allowed directories
    ///
    /// # Returns
    ///
    /// The canonicalized path if valid, or an error if access is denied.
    fn validate_working_directory(
        &self,
        dir: &std::path::Path,
        context: &ExecutorContext,
    ) -> Result<PathBuf> {
        // Canonicalize the path to resolve symlinks and prevent path traversal
        let canonical_dir = std::fs::canonicalize(dir).map_err(|e| {
            anyhow!(
                "Invalid or inaccessible working directory '{}': {}",
                dir.display(),
                e
            )
        })?;

        // Verify it's actually a directory
        if !canonical_dir.is_dir() {
            return Err(anyhow!(
                "Working directory '{}' is not a valid directory",
                dir.display()
            ));
        }

        // Validate path is within allowed directories
        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            tracing::warn!(
                "[TerminalExecutor] No allowed_directories configured - terminal cwd unrestricted"
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_dir.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[TerminalExecutor] SECURITY: Working directory '{}' resolved to '{}' which is outside allowed directories",
                dir.display(),
                canonical_dir.display()
            );
            return Err(anyhow!(
                "Access denied: working directory '{}' is outside allowed directories",
                dir.display()
            ));
        }

        Ok(canonical_dir)
    }

    /// Determine the shell command and argument based on platform and user preference.
    ///
    /// # Arguments
    ///
    /// * `shell` - Optional shell type specified by the user
    ///
    /// # Returns
    ///
    /// A tuple of (shell_command, shell_argument) for command execution.
    fn get_shell_config(shell: Option<&str>) -> (&'static str, &'static str) {
        if cfg!(windows) {
            match shell {
                Some("cmd") => ("cmd", "/C"),
                Some("bash") => ("bash", "-c"),
                Some("powershell") | None => ("powershell", "-Command"),
                Some(other) => {
                    tracing::warn!(
                        "[TerminalExecutor] Unknown shell '{}', defaulting to powershell",
                        other
                    );
                    ("powershell", "-Command")
                }
            }
        } else {
            // Unix-like systems (macOS, Linux)
            match shell {
                Some("zsh") => ("zsh", "-c"),
                Some("sh") => ("sh", "-c"),
                Some("fish") => ("fish", "-c"),
                Some("bash") | None => ("bash", "-c"),
                Some(other) => {
                    tracing::warn!(
                        "[TerminalExecutor] Unknown shell '{}', defaulting to bash",
                        other
                    );
                    ("bash", "-c")
                }
            }
        }
    }

    /// Execute a terminal command.
    ///
    /// # Arguments
    ///
    /// * `parameters` - Command parameters including:
    ///   - `command` (required): The shell command to execute
    ///   - `cwd` (optional): Working directory for command execution
    ///   - `shell` (optional): Shell type (bash, zsh, sh, powershell, cmd)
    ///   - `timeout_ms` (optional): Timeout in milliseconds (default: 60000, max: 300000)
    ///   - `stream` (optional): Whether to stream output (default: false)
    /// * `context` - The executor context for app handle and settings access
    /// * `execution_context` - The AGI execution context
    ///
    /// # Returns
    ///
    /// A JSON value containing the execution result.
    async fn execute_terminal(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        let start_time = Instant::now();
        let tool_id = format!(
            "terminal_{}",
            &context.session_id[..8.min(context.session_id.len())]
        );

        // Extract and validate command
        let command = parameters["command"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing required 'command' parameter"))?;

        if command.trim().is_empty() {
            return Err(anyhow!("Command cannot be empty"));
        }

        // SECURITY: Check blocklist patterns
        self.validate_command(command)?;

        // Get optional working directory
        let cwd = parameters
            .get("cwd")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(PathBuf::from);

        // SECURITY: Validate working directory if provided
        let canonical_cwd = if let Some(ref dir) = cwd {
            Some(self.validate_working_directory(dir, context)?)
        } else {
            None
        };

        // Get optional shell type
        let shell = parameters
            .get("shell")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());

        // Get timeout (default 60s, max 300s for safety)
        let timeout_ms = parameters
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .min(MAX_TIMEOUT_MS);

        let timeout_duration = std::time::Duration::from_millis(timeout_ms);

        // Check if streaming is requested
        let stream_output = parameters
            .get("stream")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Determine shell and arguments based on platform and user preference
        let (shell_cmd, shell_arg) = Self::get_shell_config(shell);

        tracing::info!(
            "[TerminalExecutor] Executing terminal command: shell={} timeout_ms={} cwd={:?} stream={}",
            shell_cmd,
            timeout_ms,
            canonical_cwd,
            stream_output
        );

        // Emit progress event
        if let Some(ref app_handle) = context.app_handle {
            emit_tool_progress(
                app_handle,
                &tool_id,
                0.1,
                Some(&format!("Executing command with {}...", shell_cmd)),
            );
        }

        // Build the command
        let mut cmd = Command::new(shell_cmd);
        cmd.arg(shell_arg).arg(command);

        // Set working directory if provided
        if let Some(ref dir) = canonical_cwd {
            cmd.current_dir(dir);
        }

        // Capture stdout and stderr
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        // Prevent the command from inheriting stdin (security measure)
        cmd.stdin(std::process::Stdio::null());

        // Execute with streaming or batch mode
        let result = if stream_output {
            self.execute_streaming(&mut cmd, timeout_duration, context, &tool_id)
                .await
        } else {
            self.execute_batch(&mut cmd, timeout_duration).await
        };

        // Process the result
        match result {
            Ok((stdout, stderr, exit_code, success, timed_out)) => {
                let execution_time_ms = start_time.elapsed().as_millis() as u64;

                tracing::info!(
                    "[TerminalExecutor] Terminal command completed: exit_code={:?} success={} stdout_len={} stderr_len={} timed_out={}",
                    exit_code,
                    success,
                    stdout.len(),
                    stderr.len(),
                    timed_out
                );

                // Emit terminal execution event for UI
                if let Some(ref app_handle) = context.app_handle {
                    emit_terminal_command(
                        app_handle,
                        TerminalCommand {
                            id: uuid::Uuid::new_v4().to_string(),
                            command: command.to_string(),
                            cwd: canonical_cwd
                                .as_ref()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|| ".".to_string()),
                            exit_code,
                            stdout: Some(stdout.clone()),
                            stderr: Some(stderr.clone()),
                            duration: Some(execution_time_ms),
                            session_id: Some(context.session_id.clone()),
                            agent_id: None,
                        },
                    );

                    // Emit final output chunks for streaming display
                    if !stdout.is_empty() {
                        emit_tool_output_chunk(
                            app_handle,
                            &tool_id,
                            &stdout,
                            OutputChunkType::Stdout,
                            false,
                        );
                    }
                    if !stderr.is_empty() {
                        emit_tool_output_chunk(
                            app_handle,
                            &tool_id,
                            &stderr,
                            OutputChunkType::Stderr,
                            false,
                        );
                    }
                    emit_tool_output_chunk(
                        app_handle,
                        &tool_id,
                        &format!(
                            "\n[Exit code: {}] [Time: {}ms]\n",
                            exit_code
                                .map(|c| c.to_string())
                                .unwrap_or_else(|| "N/A".to_string()),
                            execution_time_ms
                        ),
                        OutputChunkType::Stdout,
                        true,
                    );
                }

                Ok(json!({
                    "success": success,
                    "exit_code": exit_code,
                    "stdout": stdout,
                    "stderr": stderr,
                    "timed_out": timed_out,
                    "shell": shell_cmd,
                    "cwd": canonical_cwd.as_ref().map(|p| p.to_string_lossy().to_string()),
                    "execution_time_ms": execution_time_ms
                }))
            }
            Err(e) => {
                let execution_time_ms = start_time.elapsed().as_millis() as u64;
                tracing::error!("[TerminalExecutor] Terminal command failed: {}", e);

                // Emit error event for UI
                if let Some(ref app_handle) = context.app_handle {
                    emit_terminal_command(
                        app_handle,
                        TerminalCommand {
                            id: uuid::Uuid::new_v4().to_string(),
                            command: command.to_string(),
                            cwd: canonical_cwd
                                .as_ref()
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|| ".".to_string()),
                            exit_code: None,
                            stdout: None,
                            stderr: Some(e.to_string()),
                            duration: Some(execution_time_ms),
                            session_id: Some(context.session_id.clone()),
                            agent_id: None,
                        },
                    );
                }

                Err(e)
            }
        }
    }

    /// Execute a command in batch mode (wait for completion).
    ///
    /// # Arguments
    ///
    /// * `cmd` - The command to execute
    /// * `timeout` - Maximum execution time
    ///
    /// # Returns
    ///
    /// A tuple of (stdout, stderr, exit_code, success, timed_out).
    async fn execute_batch(
        &self,
        cmd: &mut Command,
        timeout: std::time::Duration,
    ) -> Result<(String, String, Option<i32>, bool, bool)> {
        let output = tokio::time::timeout(timeout, cmd.output()).await;

        match output {
            Ok(Ok(result)) => {
                // Process stdout with size limit
                let stdout_raw = result.stdout;
                let stdout_truncated = stdout_raw.len() > MAX_STDOUT_BYTES;
                let stdout_bytes = if stdout_truncated {
                    &stdout_raw[..MAX_STDOUT_BYTES]
                } else {
                    &stdout_raw[..]
                };
                let mut stdout = String::from_utf8_lossy(stdout_bytes).to_string();
                if stdout_truncated {
                    stdout.push_str("\n... [stdout truncated at 10MB]");
                }

                // Process stderr with size limit
                let stderr_raw = result.stderr;
                let stderr_truncated = stderr_raw.len() > MAX_STDERR_BYTES;
                let stderr_bytes = if stderr_truncated {
                    &stderr_raw[..MAX_STDERR_BYTES]
                } else {
                    &stderr_raw[..]
                };
                let mut stderr = String::from_utf8_lossy(stderr_bytes).to_string();
                if stderr_truncated {
                    stderr.push_str("\n... [stderr truncated at 1MB]");
                }

                let exit_code = result.status.code();
                let success = result.status.success();

                Ok((stdout, stderr, exit_code, success, false))
            }
            Ok(Err(e)) => {
                // Command failed to execute (e.g., shell not found)
                Err(anyhow!("Failed to execute command: {}", e))
            }
            Err(_timeout_error) => {
                // Command timed out - return a result rather than error
                // This allows the AGI to handle timeouts gracefully
                Ok((
                    String::new(),
                    format!("Command timed out after {}ms", timeout.as_millis()),
                    None,
                    false,
                    true,
                ))
            }
        }
    }

    /// Execute a command with streaming output.
    ///
    /// # Arguments
    ///
    /// * `cmd` - The command to execute
    /// * `timeout` - Maximum execution time
    /// * `context` - The executor context for emitting events
    /// * `tool_id` - The tool ID for event emission
    ///
    /// # Returns
    ///
    /// A tuple of (stdout, stderr, exit_code, success, timed_out).
    async fn execute_streaming(
        &self,
        cmd: &mut Command,
        timeout: std::time::Duration,
        context: &ExecutorContext,
        tool_id: &str,
    ) -> Result<(String, String, Option<i32>, bool, bool)> {
        let mut child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn command: {}", e))?;

        let stdout_handle = child.stdout.take();
        let stderr_handle = child.stderr.take();

        // Spawn tasks for reading stdout and stderr
        let app_handle = context.app_handle.clone();
        let tool_id_owned = tool_id.to_string();

        let stdout_task = tokio::spawn(async move {
            let mut output = String::new();
            if let Some(stdout) = stdout_handle {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    output.push_str(&line);
                    output.push('\n');

                    // Emit streaming output
                    if let Some(ref app) = app_handle {
                        emit_tool_output_chunk(
                            app,
                            &tool_id_owned,
                            &format!("{}\n", line),
                            OutputChunkType::Stdout,
                            false,
                        );
                    }

                    // Check size limit
                    if output.len() > MAX_STDOUT_BYTES {
                        output.truncate(MAX_STDOUT_BYTES);
                        output.push_str("\n... [stdout truncated at 10MB]");
                        break;
                    }
                }
            }
            output
        });

        let app_handle_stderr = context.app_handle.clone();
        let tool_id_stderr = tool_id.to_string();

        let stderr_task = tokio::spawn(async move {
            let mut output = String::new();
            if let Some(stderr) = stderr_handle {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    output.push_str(&line);
                    output.push('\n');

                    // Emit streaming output
                    if let Some(ref app) = app_handle_stderr {
                        emit_tool_output_chunk(
                            app,
                            &tool_id_stderr,
                            &format!("{}\n", line),
                            OutputChunkType::Stderr,
                            false,
                        );
                    }

                    // Check size limit
                    if output.len() > MAX_STDERR_BYTES {
                        output.truncate(MAX_STDERR_BYTES);
                        output.push_str("\n... [stderr truncated at 1MB]");
                        break;
                    }
                }
            }
            output
        });

        // Wait for process with timeout
        let wait_result = tokio::time::timeout(timeout, child.wait()).await;

        // Collect output from tasks
        let stdout_buffer = stdout_task.await.unwrap_or_default();
        let stderr_buffer = stderr_task.await.unwrap_or_default();

        match wait_result {
            Ok(Ok(status)) => {
                let exit_code = status.code();
                let success = status.success();
                Ok((stdout_buffer, stderr_buffer, exit_code, success, false))
            }
            Ok(Err(e)) => Err(anyhow!("Failed to wait for command: {}", e)),
            Err(_timeout_error) => {
                // Try to kill the process
                let _ = child.kill().await;
                Ok((
                    stdout_buffer,
                    format!(
                        "{}\nCommand timed out after {}ms",
                        stderr_buffer,
                        timeout.as_millis()
                    ),
                    None,
                    false,
                    true,
                ))
            }
        }
    }
}

impl Default for TerminalExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for TerminalExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["terminal_execute"]
    }

    fn description(&self) -> &'static str {
        "Terminal command executor with security controls and streaming output"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "terminal_execute" => {
                self.execute_terminal(parameters, context, execution_context)
                    .await
            }
            _ => Err(anyhow!("Unknown terminal tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_executor_tool_names() {
        let executor = TerminalExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"terminal_execute"));
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn test_terminal_executor_description() {
        let executor = TerminalExecutor::new();
        let description = executor.description();

        assert!(!description.is_empty());
        assert!(description.contains("Terminal"));
    }

    #[test]
    fn test_dangerous_command_blocked() {
        let executor = TerminalExecutor::new();

        // Safe commands should pass
        assert!(executor.validate_command("ls -la").is_ok());
        assert!(executor.validate_command("echo hello").is_ok());
        assert!(executor.validate_command("cat file.txt").is_ok());
        assert!(executor.validate_command("grep pattern file").is_ok());

        // Dangerous commands should be blocked
        assert!(executor.validate_command("rm -rf /").is_err());
        assert!(executor.validate_command("rm -rf /*").is_err());
        assert!(executor.validate_command("curl | bash").is_err());
        assert!(executor.validate_command("wget | sh").is_err());
        assert!(executor.validate_command("shutdown").is_err());
        assert!(executor.validate_command("reboot").is_err());
        assert!(executor.validate_command(":(){ :|:& };:").is_err());
    }

    #[test]
    fn test_blocked_patterns_case_insensitive() {
        let executor = TerminalExecutor::new();

        // Case variations should still be blocked
        assert!(executor.validate_command("RM -RF /").is_err());
        assert!(executor.validate_command("Rm -Rf /").is_err());
        assert!(executor.validate_command("SHUTDOWN").is_err());
        assert!(executor.validate_command("Reboot").is_err());
    }

    #[test]
    fn test_blocked_prefixes() {
        let executor = TerminalExecutor::new();

        assert!(executor
            .validate_command("sudo dd if=/dev/zero of=/dev/sda")
            .is_err());
        assert!(executor
            .validate_command("sudo mkfs.ext4 /dev/sda")
            .is_err());
        assert!(executor.validate_command("sudo rm -rf /").is_err());
    }

    #[test]
    fn test_shell_config_unix() {
        // Test Unix shell configurations
        if !cfg!(windows) {
            assert_eq!(TerminalExecutor::get_shell_config(None), ("bash", "-c"));
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("bash")),
                ("bash", "-c")
            );
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("zsh")),
                ("zsh", "-c")
            );
            assert_eq!(TerminalExecutor::get_shell_config(Some("sh")), ("sh", "-c"));
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("fish")),
                ("fish", "-c")
            );
            // Unknown shells default to bash
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("unknown")),
                ("bash", "-c")
            );
        }
    }

    #[test]
    fn test_shell_config_windows() {
        // Test Windows shell configurations
        if cfg!(windows) {
            assert_eq!(
                TerminalExecutor::get_shell_config(None),
                ("powershell", "-Command")
            );
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("powershell")),
                ("powershell", "-Command")
            );
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("cmd")),
                ("cmd", "/C")
            );
            assert_eq!(
                TerminalExecutor::get_shell_config(Some("bash")),
                ("bash", "-c")
            );
        }
    }

    #[test]
    fn test_empty_command_validation() {
        let executor = TerminalExecutor::new();

        // Empty and whitespace-only commands should be caught at a higher level
        // but the validate_command function itself should pass them
        // (the check is done in execute_terminal)
        assert!(executor.validate_command("").is_ok());
        assert!(executor.validate_command("   ").is_ok());
    }

    #[test]
    fn test_default_trait() {
        let executor = TerminalExecutor::default();
        assert_eq!(executor.tool_names(), vec!["terminal_execute"]);
    }
}
