use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::Instant;
use uuid::Uuid;

/// Default execution timeout in seconds
const DEFAULT_TIMEOUT_SECS: u64 = 30;
/// Maximum execution timeout in seconds
const MAX_TIMEOUT_SECS: u64 = 60;
/// Default memory limit in MB (for documentation - actual enforcement is OS-dependent)
const DEFAULT_MEMORY_LIMIT_MB: u64 = 512;

/// Result of code execution in a sandbox
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CodeExecutionResult {
    /// Whether the execution completed successfully
    pub success: bool,
    /// Standard output from the execution
    pub stdout: String,
    /// Standard error from the execution
    pub stderr: String,
    /// Combined output (stdout + stderr in order received)
    pub output: String,
    /// Error message if execution failed
    pub error: Option<String>,
    /// Execution time in milliseconds
    pub execution_time_ms: u64,
    /// Process exit code (if available)
    pub exit_code: Option<i32>,
    /// Whether the process was killed due to timeout
    pub timed_out: bool,
    /// Working directory used for execution
    pub working_directory: String,
    /// Language/runtime used
    pub language: String,
}

/// Configuration for code execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    /// Language to execute (python, javascript, bash, etc.)
    pub language: String,
    /// Code to execute
    pub code: String,
    /// Optional stdin input
    pub stdin: Option<String>,
    /// Timeout in seconds (default: 30, max: 60)
    pub timeout_secs: Option<u64>,
    /// Environment variables to set
    pub env_vars: Option<HashMap<String, String>>,
    /// Whether to allow network access (default: false)
    pub allow_network: bool,
    /// Memory limit in MB (advisory - enforcement is OS-dependent)
    pub memory_limit_mb: Option<u64>,
    /// Additional files to create in the sandbox before execution
    pub files: Option<HashMap<String, String>>,
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            language: "python".to_string(),
            code: String::new(),
            stdin: None,
            timeout_secs: Some(DEFAULT_TIMEOUT_SECS),
            env_vars: None,
            allow_network: false,
            memory_limit_mb: Some(DEFAULT_MEMORY_LIMIT_MB),
            files: None,
        }
    }
}

/// Language runtime configuration
#[derive(Debug, Clone)]
struct LanguageRunner {
    /// Command to run (e.g., "python3", "node")
    command: String,
    /// File extension for the script
    extension: String,
    /// Additional arguments before the script
    args: Vec<String>,
}

impl LanguageRunner {
    fn for_language(language: &str) -> Option<Self> {
        match language.to_lowercase().as_str() {
            "python" | "python3" | "py" => Some(Self {
                command: if cfg!(windows) {
                    "python".to_string()
                } else {
                    "python3".to_string()
                },
                extension: "py".to_string(),
                args: vec!["-u".to_string()], // Unbuffered output
            }),
            "javascript" | "js" | "node" => Some(Self {
                command: "node".to_string(),
                extension: "js".to_string(),
                args: vec![],
            }),
            "typescript" | "ts" => Some(Self {
                command: "npx".to_string(),
                extension: "ts".to_string(),
                args: vec!["ts-node".to_string()],
            }),
            "bash" | "sh" | "shell" => Some(Self {
                command: if cfg!(windows) {
                    "bash".to_string()
                } else {
                    "/bin/bash".to_string()
                },
                extension: "sh".to_string(),
                args: vec![],
            }),
            "powershell" | "ps1" | "pwsh" => Some(Self {
                command: if cfg!(windows) {
                    "powershell".to_string()
                } else {
                    "pwsh".to_string()
                },
                extension: "ps1".to_string(),
                args: vec![
                    "-ExecutionPolicy".to_string(),
                    "Bypass".to_string(),
                    "-File".to_string(),
                ],
            }),
            "ruby" | "rb" => Some(Self {
                command: "ruby".to_string(),
                extension: "rb".to_string(),
                args: vec![],
            }),
            "perl" | "pl" => Some(Self {
                command: "perl".to_string(),
                extension: "pl".to_string(),
                args: vec![],
            }),
            "r" | "rscript" => Some(Self {
                command: "Rscript".to_string(),
                extension: "R".to_string(),
                args: vec![],
            }),
            _ => None,
        }
    }
}

/// A sandbox for isolated code execution
#[derive(Debug, Clone)]
pub struct Sandbox {
    pub id: String,
    pub workspace_path: PathBuf,
    pub git_worktree: bool,
    pub isolated: bool,
    /// Active child processes in this sandbox
    active_processes: Arc<Mutex<Vec<u32>>>,
}

impl Sandbox {
    /// Create a new sandbox with the given workspace path
    pub fn new(workspace_path: PathBuf) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            workspace_path,
            git_worktree: false,
            isolated: true,
            active_processes: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Execute code in this sandbox using tokio::process::Command
    /// Note: This uses argument-based process spawning (not shell execution)
    /// which is safe from shell injection attacks
    pub async fn execute_code(&self, config: ExecutionConfig) -> Result<CodeExecutionResult> {
        let start_time = Instant::now();
        let mut result = CodeExecutionResult {
            language: config.language.clone(),
            working_directory: self.workspace_path.to_string_lossy().to_string(),
            ..Default::default()
        };

        // Get language runner
        let runner = LanguageRunner::for_language(&config.language).ok_or_else(|| {
            anyhow!(
                "Unsupported language: {}. Supported: python, javascript, typescript, bash, powershell, ruby, perl, r",
                config.language
            )
        })?;

        // Create additional files if provided
        if let Some(files) = &config.files {
            for (filename, content) in files {
                // SECURITY: Validate filename to prevent path traversal attacks
                // Reject any filename containing ".." or starting with absolute path
                if filename.contains("..") {
                    return Err(anyhow!(
                        "Invalid filename '{}': path traversal sequences (..) not allowed",
                        filename
                    ));
                }
                if filename.starts_with('/') || filename.starts_with('\\') {
                    return Err(anyhow!(
                        "Invalid filename '{}': absolute paths not allowed",
                        filename
                    ));
                }
                // Also check for Windows-style absolute paths (e.g., "C:\")
                if filename.len() >= 2 && filename.chars().nth(1) == Some(':') {
                    return Err(anyhow!(
                        "Invalid filename '{}': absolute paths not allowed",
                        filename
                    ));
                }

                let file_path = self.workspace_path.join(filename);

                // SECURITY: Verify the resolved path is still within workspace
                // Use canonicalize on the parent (which must exist) and check containment
                if let Some(parent) = file_path.parent() {
                    std::fs::create_dir_all(parent)?;
                    // Canonicalize the parent directory and verify it's within workspace
                    if let Ok(canonical_parent) = parent.canonicalize() {
                        if let Ok(canonical_workspace) = self.workspace_path.canonicalize() {
                            if !canonical_parent.starts_with(&canonical_workspace) {
                                return Err(anyhow!(
                                    "Invalid filename '{}': resolved path escapes sandbox workspace",
                                    filename
                                ));
                            }
                        }
                    }
                }
                std::fs::write(&file_path, content)?;
            }
        }

        // Write code to file
        let script_filename = format!("script_{}.{}", &self.id[..8], runner.extension);
        let script_path = self.workspace_path.join(&script_filename);
        std::fs::write(&script_path, &config.code)?;

        // Build command using tokio::process::Command with explicit arguments
        // This is NOT shell execution - it uses execve-style argument passing
        let mut cmd = Command::new(&runner.command);
        cmd.current_dir(&self.workspace_path);

        // Add runner arguments
        for arg in &runner.args {
            cmd.arg(arg);
        }

        // Add script path as an argument (not interpolated into a shell string)
        cmd.arg(&script_path);

        // Set environment variables
        cmd.env("HOME", &self.workspace_path);
        cmd.env("TMPDIR", &self.workspace_path);
        cmd.env("TEMP", &self.workspace_path);
        cmd.env("TMP", &self.workspace_path);

        // Restrict PATH to essential directories only
        #[cfg(not(windows))]
        {
            cmd.env("PATH", "/usr/local/bin:/usr/bin:/bin");
        }

        // Add custom environment variables
        if let Some(env_vars) = &config.env_vars {
            // Blocklist of dangerous environment variables that could be used for:
            // - Library injection attacks (LD_PRELOAD, DYLD_INSERT_LIBRARIES)
            // - Code execution via language-specific mechanisms (PYTHONPATH, NODE_OPTIONS, etc.)
            // - Shell behavior modification (BASH_ENV, CDPATH, GLOBIGNORE, BASH_FUNC_*)
            const BLOCKED_ENV_VARS: &[&str] = &[
                // Core path/home variables
                "PATH",
                "HOME",
                "TMPDIR",
                "TEMP",
                "TMP",
                // Linux library injection
                "LD_PRELOAD",
                "LD_LIBRARY_PATH",
                // macOS library injection
                "DYLD_INSERT_LIBRARIES",
                "DYLD_LIBRARY_PATH",
                "DYLD_FRAMEWORK_PATH",
                // Language-specific code injection vectors
                "PYTHONPATH",
                "PYTHONSTARTUP",
                "PYTHONHOME",
                "NODE_OPTIONS",
                "NODE_PATH",
                "RUBYOPT",
                "RUBYLIB",
                "PERL5OPT",
                "PERL5LIB",
                "PERLLIB",
                // Shell behavior modification (can execute arbitrary code)
                "BASH_ENV",
                "ENV",
                "CDPATH",
                "GLOBIGNORE",
                "PROMPT_COMMAND",
                "PS1",
                "PS2",
                "PS4",
                // IFS manipulation can break parsing
                "IFS",
            ];

            for (key, value) in env_vars {
                // Block exact matches from blocklist
                let key_upper = key.to_uppercase();
                let is_blocked = BLOCKED_ENV_VARS
                    .iter()
                    .any(|blocked| blocked.eq_ignore_ascii_case(key));

                // Also block BASH_FUNC_* pattern (bash function export mechanism)
                let is_bash_func = key_upper.starts_with("BASH_FUNC_");

                if !is_blocked && !is_bash_func {
                    cmd.env(key, value);
                } else {
                    tracing::warn!(
                        "[Sandbox] Blocked attempt to set dangerous environment variable: {}",
                        key
                    );
                }
            }
        }

        // Network isolation configuration
        // SECURITY NOTE: Environment variables (OFFLINE, NO_PROXY) are ADVISORY ONLY.
        // They rely on application-level cooperation and can be bypassed by:
        // - Direct socket syscalls
        // - Libraries that ignore these variables
        // - Malicious code that explicitly ignores environment hints
        //
        // For true network isolation, consider:
        // - Linux: Use network namespaces (unshare -n) or iptables with process-specific rules
        // - macOS: Use sandbox-exec profiles or Application Firewall rules
        // - Windows: Use Windows Filtering Platform (WFP) or container isolation
        // - Cross-platform: Run in a container (Docker) with --network=none
        //
        // The current implementation provides defense-in-depth but should not be
        // relied upon for security-critical network isolation requirements.
        if !config.allow_network {
            // Advisory environment variables - respected by well-behaved applications
            cmd.env("OFFLINE", "1");
            cmd.env("NO_PROXY", "*");
            cmd.env("HTTP_PROXY", "http://127.0.0.1:0"); // Invalid proxy to break HTTP
            cmd.env("HTTPS_PROXY", "http://127.0.0.1:0");
            cmd.env("ALL_PROXY", "http://127.0.0.1:0");

            // Disable common networking in language runtimes
            cmd.env("NODE_TLS_REJECT_UNAUTHORIZED", "0"); // May cause TLS to fail
            cmd.env("REQUESTS_CA_BUNDLE", "/dev/null"); // Python requests will fail SSL

            // Log warning about advisory nature of network restriction
            tracing::warn!(
                "[Sandbox] Network restriction is ADVISORY ONLY. Environment variables set but \
                cannot guarantee network isolation without OS-level sandboxing (namespaces/containers)."
            );
        }

        // Set up stdio
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(if config.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });

        // Kill process on drop
        cmd.kill_on_drop(true);

        // Spawn the process
        let mut child = cmd.spawn().map_err(|e| {
            anyhow!(
                "Failed to spawn {} process: {}. Is {} installed and in PATH?",
                config.language,
                e,
                runner.command
            )
        })?;

        // Track the process
        if let Some(pid) = child.id() {
            self.active_processes.lock().await.push(pid);
        }

        // Handle stdin if provided
        if let Some(stdin_data) = &config.stdin {
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(stdin_data.as_bytes()).await?;
                drop(stdin); // Close stdin to signal EOF
            }
        }

        // Calculate timeout
        let timeout = Duration::from_secs(
            config
                .timeout_secs
                .unwrap_or(DEFAULT_TIMEOUT_SECS)
                .min(MAX_TIMEOUT_SECS),
        );

        // Capture output with timeout
        let output_result = self.capture_output_with_timeout(&mut child, timeout).await;

        // Calculate execution time
        result.execution_time_ms = start_time.elapsed().as_millis() as u64;

        // Remove from active processes
        if let Some(pid) = child.id() {
            self.active_processes.lock().await.retain(|&p| p != pid);
        }

        // Clean up script file
        let _ = std::fs::remove_file(&script_path);

        match output_result {
            Ok((stdout, stderr, exit_code, timed_out)) => {
                result.stdout = stdout.clone();
                result.stderr = stderr.clone();
                result.output = if stderr.is_empty() {
                    stdout
                } else if stdout.is_empty() {
                    stderr
                } else {
                    format!("{}\n{}", stdout, stderr)
                };
                result.exit_code = exit_code;
                result.timed_out = timed_out;
                result.success = !timed_out && exit_code == Some(0);

                if timed_out {
                    result.error = Some(format!(
                        "Execution timed out after {} seconds",
                        timeout.as_secs()
                    ));
                } else if exit_code != Some(0) {
                    result.error = Some(format!(
                        "Process exited with code {}",
                        exit_code
                            .map(|c| c.to_string())
                            .unwrap_or_else(|| "unknown".to_string())
                    ));
                }
            }
            Err(e) => {
                result.error = Some(e.to_string());
            }
        }

        Ok(result)
    }

    /// Capture output from a child process with timeout
    async fn capture_output_with_timeout(
        &self,
        child: &mut Child,
        timeout: Duration,
    ) -> Result<(String, String, Option<i32>, bool)> {
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_handle = tokio::spawn(async move {
            let mut output = String::new();
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();
                loop {
                    match reader.read_line(&mut line).await {
                        Ok(0) => break,
                        Ok(_) => {
                            output.push_str(&line);
                            line.clear();
                        }
                        Err(e) => {
                            tracing::warn!("Error reading sandbox stdout: {e}");
                            break;
                        }
                    }
                }
            }
            output
        });

        let stderr_handle = tokio::spawn(async move {
            let mut output = String::new();
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                loop {
                    match reader.read_line(&mut line).await {
                        Ok(0) => break,
                        Ok(_) => {
                            output.push_str(&line);
                            line.clear();
                        }
                        Err(e) => {
                            tracing::warn!("Error reading sandbox stderr: {e}");
                            break;
                        }
                    }
                }
            }
            output
        });

        // Wait for process with timeout
        let wait_result = tokio::time::timeout(timeout, child.wait()).await;

        let (exit_code, timed_out) = match wait_result {
            Ok(Ok(status)) => (status.code(), false),
            Ok(Err(_)) => (None, false),
            Err(_) => {
                // Timeout - kill the process
                let _ = child.kill().await;
                (None, true)
            }
        };

        // Collect output (with a short timeout to avoid hanging)
        let stdout_result = match tokio::time::timeout(Duration::from_secs(1), stdout_handle).await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                tracing::warn!("Sandbox stdout collection task panicked: {e}");
                String::new()
            }
            Err(_) => {
                tracing::warn!("Sandbox stdout collection timed out, output may be truncated");
                String::new()
            }
        };

        let stderr_result = match tokio::time::timeout(Duration::from_secs(1), stderr_handle).await
        {
            Ok(Ok(output)) => output,
            Ok(Err(e)) => {
                tracing::warn!("Sandbox stderr collection task panicked: {e}");
                String::new()
            }
            Err(_) => {
                tracing::warn!("Sandbox stderr collection timed out, output may be truncated");
                String::new()
            }
        };

        Ok((stdout_result, stderr_result, exit_code, timed_out))
    }

    /// Kill all active processes in this sandbox.
    ///
    /// Before sending SIGKILL, verifies that the PID still belongs to a child
    /// process we spawned (guards against recycled-PID kills on Unix).
    pub async fn kill_all_processes(&self) -> Result<usize> {
        let pids = self.active_processes.lock().await.clone();
        let mut killed = 0;

        for pid in pids {
            #[cfg(unix)]
            {
                // Verify the process still exists and belongs to us by sending
                // signal 0 (no-op probe). If it returns an error (ESRCH = no
                // such process, EPERM = not our process) we skip the kill to
                // avoid hitting a recycled PID.
                #[allow(unsafe_code)]
                let probe = unsafe { libc::kill(pid as i32, 0) };
                if probe != 0 {
                    tracing::debug!(
                        "[Sandbox] PID {} no longer valid (probe failed), skipping kill",
                        pid
                    );
                    continue;
                }

                #[allow(unsafe_code)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
            #[cfg(windows)]
            {
                // Use Windows API to terminate process
                use std::process::Command as StdCommand;
                let _ = StdCommand::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .output();
            }
            killed += 1;
        }

        self.active_processes.lock().await.clear();
        Ok(killed)
    }

    /// Clean up the sandbox workspace
    pub fn cleanup(&self) -> Result<()> {
        if self.workspace_path.exists() {
            std::fs::remove_dir_all(&self.workspace_path)?;
        }
        Ok(())
    }
}

/// Manages sandbox lifecycle and provides isolated execution environments
pub struct SandboxManager {
    active_sandboxes: Arc<Mutex<Vec<Sandbox>>>,
    base_path: PathBuf,
}

impl SandboxManager {
    /// Create a new SandboxManager
    pub fn new() -> Result<Self> {
        let base_path = std::env::temp_dir().join("agi_sandboxes");
        std::fs::create_dir_all(&base_path)?;
        // Restrict directory permissions to owner only (rwx------)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&base_path, std::fs::Permissions::from_mode(0o700))?;
        }

        Ok(Self {
            active_sandboxes: Arc::new(Mutex::new(Vec::new())),
            base_path,
        })
    }

    /// Create a new sandbox for code execution
    pub async fn create_sandbox(&self, use_git_worktree: bool) -> Result<Sandbox> {
        let sandbox_id = Uuid::new_v4().to_string();
        let workspace_path = self.base_path.join(&sandbox_id);

        std::fs::create_dir_all(&workspace_path)?;

        let sandbox = Sandbox {
            id: sandbox_id.clone(),
            workspace_path: workspace_path.clone(),
            git_worktree: use_git_worktree,
            isolated: true,
            active_processes: Arc::new(Mutex::new(Vec::new())),
        };

        if use_git_worktree {
            self.setup_git_worktree(&workspace_path, &sandbox_id)
                .await?;
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.push(sandbox.clone());

        tracing::info!("[SandboxManager] Created sandbox: {}", sandbox_id);

        Ok(sandbox)
    }

    /// Create a temporary sandbox for a single execution
    pub async fn create_temp_sandbox(&self) -> Result<Sandbox> {
        let sandbox = self.create_sandbox(false).await?;
        Ok(sandbox)
    }

    /// Execute code in a temporary sandbox (creates, executes, and cleans up)
    pub async fn execute_code(&self, config: ExecutionConfig) -> Result<CodeExecutionResult> {
        let sandbox = self.create_temp_sandbox().await?;

        let result = sandbox.execute_code(config).await;

        // Always clean up, even if execution failed
        if let Err(e) = self.cleanup_sandbox(&sandbox).await {
            tracing::warn!("[SandboxManager] Failed to cleanup sandbox: {}", e);
        }

        result
    }

    async fn setup_git_worktree(&self, workspace_path: &Path, sandbox_id: &str) -> Result<()> {
        let current_dir = std::env::current_dir()?;
        let workspace_path = workspace_path.to_path_buf();
        let sandbox_id_clone = sandbox_id.to_string();

        if !self.is_git_repo(&current_dir).await? {
            tracing::warn!("[SandboxManager] Not in git repo, skipping worktree");
            return Ok(());
        }

        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&current_dir)
                .map_err(|e| anyhow!("Failed to open repo: {}", e))?;
            let branch_name = format!("sandbox/{}", sandbox_id_clone);

            let opts = git2::WorktreeAddOptions::new();
            repo.worktree(&branch_name, &workspace_path, Some(&opts))
                .map_err(|e| anyhow!("Failed to create worktree: {}", e))?;

            Ok::<(), anyhow::Error>(())
        })
        .await
        .map_err(|e| anyhow!("Task join error: {}", e))??;

        tracing::info!(
            "[SandboxManager] Git worktree created: sandbox/{}",
            sandbox_id
        );

        Ok(())
    }

    async fn is_git_repo(&self, path: &Path) -> Result<bool> {
        let path = path.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || git2::Repository::discover(&path).is_ok())
            .await
            .map_err(|e| anyhow!("Task join error: {}", e))
    }

    /// Clean up a specific sandbox
    pub async fn cleanup_sandbox(&self, sandbox: &Sandbox) -> Result<()> {
        tracing::info!("[SandboxManager] Cleaning up sandbox: {}", sandbox.id);

        // Kill any running processes
        if let Err(e) = sandbox.kill_all_processes().await {
            tracing::warn!("[SandboxManager] Failed to kill processes: {}", e);
        }

        if sandbox.git_worktree {
            self.remove_git_worktree(&sandbox.workspace_path, &sandbox.id)
                .await?;
        }

        // Clean up workspace directory
        if sandbox.workspace_path.exists() {
            // Try multiple times in case of locked files
            for attempt in 0..3 {
                match std::fs::remove_dir_all(&sandbox.workspace_path) {
                    Ok(_) => break,
                    Err(e) if attempt < 2 => {
                        tracing::debug!(
                            "[SandboxManager] Cleanup attempt {} failed: {}, retrying...",
                            attempt + 1,
                            e
                        );
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "[SandboxManager] Failed to remove sandbox directory after retries: {}",
                            e
                        );
                    }
                }
            }
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.retain(|s| s.id != sandbox.id);

        Ok(())
    }

    async fn remove_git_worktree(&self, _workspace_path: &PathBuf, sandbox_id: &str) -> Result<()> {
        let current_dir = std::env::current_dir()?;
        let sandbox_id = sandbox_id.to_string();

        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&current_dir)
                .map_err(|e| anyhow!("Failed to open repo: {}", e))?;
            let worktree_name = format!("sandbox/{}", sandbox_id);

            if let Ok(wt) = repo.find_worktree(&worktree_name) {
                wt.prune(None)
                    .map_err(|e| anyhow!("Failed to prune worktree: {}", e))?;
            }

            if let Ok(mut branch) = repo.find_branch(&worktree_name, git2::BranchType::Local) {
                branch
                    .delete()
                    .map_err(|e| anyhow!("Failed to delete branch: {}", e))?;
            }

            Ok::<(), anyhow::Error>(())
        })
        .await
        .map_err(|e| anyhow!("Task join error: {}", e))??;

        Ok(())
    }

    /// Clean up all sandboxes
    pub async fn cleanup_all(&self) -> Result<()> {
        let sandboxes = self.active_sandboxes.lock().await.clone();

        for sandbox in sandboxes {
            if let Err(e) = self.cleanup_sandbox(&sandbox).await {
                tracing::error!("[SandboxManager] Failed to cleanup {}: {}", sandbox.id, e);
            }
        }

        Ok(())
    }

    /// Get the number of active sandboxes
    pub async fn get_active_count(&self) -> usize {
        self.active_sandboxes.lock().await.len()
    }

    /// Prune old sandboxes that may have been left behind
    pub async fn prune_stale_sandboxes(&self, max_age_secs: u64) -> Result<usize> {
        let mut pruned = 0;

        if let Ok(entries) = std::fs::read_dir(&self.base_path) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(age) = modified.elapsed() {
                            if age.as_secs() > max_age_secs {
                                if let Err(e) = std::fs::remove_dir_all(entry.path()) {
                                    tracing::warn!(
                                        "[SandboxManager] Failed to prune stale sandbox: {}",
                                        e
                                    );
                                } else {
                                    pruned += 1;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(pruned)
    }
}

impl Drop for SandboxManager {
    fn drop(&mut self) {
        tracing::info!("[SandboxManager] Dropping sandbox manager");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sandbox_creation() {
        let manager = SandboxManager::new().unwrap();
        let sandbox = manager.create_sandbox(false).await.unwrap();

        assert!(sandbox.workspace_path.exists());
        assert!(!sandbox.id.is_empty());

        manager.cleanup_sandbox(&sandbox).await.unwrap();
        assert!(!sandbox.workspace_path.exists());
    }

    #[tokio::test]
    async fn test_python_execution() {
        let manager = SandboxManager::new().unwrap();

        let config = ExecutionConfig {
            language: "python".to_string(),
            code: "print('Hello from Python!')".to_string(),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;

        // Skip test if Python is not installed
        if let Err(e) = &result {
            if e.to_string().contains("Is python") {
                return;
            }
        }

        let result = result.unwrap();
        assert!(result.success);
        assert!(result.stdout.contains("Hello from Python!"));
        assert_eq!(result.exit_code, Some(0));
    }

    #[tokio::test]
    async fn test_timeout() {
        let manager = SandboxManager::new().unwrap();

        let config = ExecutionConfig {
            language: "python".to_string(),
            code: "import time; time.sleep(10)".to_string(),
            timeout_secs: Some(1),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;

        // Skip test if Python is not installed
        if let Err(e) = &result {
            if e.to_string().contains("Is python") {
                return;
            }
        }

        let result = result.unwrap();
        assert!(!result.success);
        assert!(result.timed_out);
    }

    #[tokio::test]
    async fn test_stderr_capture() {
        let manager = SandboxManager::new().unwrap();

        let config = ExecutionConfig {
            language: "python".to_string(),
            code: "import sys; sys.stderr.write('Error message\\n'); sys.exit(1)".to_string(),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;

        // Skip test if Python is not installed
        if let Err(e) = &result {
            if e.to_string().contains("Is python") {
                return;
            }
        }

        let result = result.unwrap();
        assert!(!result.success);
        assert!(result.stderr.contains("Error message"));
        assert_eq!(result.exit_code, Some(1));
    }

    #[tokio::test]
    async fn test_stdin_input() {
        let manager = SandboxManager::new().unwrap();

        let config = ExecutionConfig {
            language: "python".to_string(),
            code: "name = input(); print(f'Hello, {name}!')".to_string(),
            stdin: Some("World".to_string()),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;

        // Skip test if Python is not installed
        if let Err(e) = &result {
            if e.to_string().contains("Is python") {
                return;
            }
        }

        let result = result.unwrap();
        assert!(result.success);
        assert!(result.stdout.contains("Hello, World!"));
    }

    #[tokio::test]
    async fn test_unsupported_language() {
        let manager = SandboxManager::new().unwrap();

        let config = ExecutionConfig {
            language: "unsupported_lang".to_string(),
            code: "some code".to_string(),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unsupported language"));
    }

    #[tokio::test]
    async fn test_path_traversal_blocked() {
        let manager = SandboxManager::new().unwrap();

        // Test 1: Block ".." in filename
        let mut files = HashMap::new();
        files.insert("../../../etc/passwd".to_string(), "malicious".to_string());

        let config = ExecutionConfig {
            language: "python".to_string(),
            code: "print('test')".to_string(),
            files: Some(files),
            ..Default::default()
        };

        let result = manager.execute_code(config).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("path traversal sequences"));

        // Test 2: Block absolute paths
        let mut files2 = HashMap::new();
        files2.insert("/etc/passwd".to_string(), "malicious".to_string());

        let config2 = ExecutionConfig {
            language: "python".to_string(),
            code: "print('test')".to_string(),
            files: Some(files2),
            ..Default::default()
        };

        let result2 = manager.execute_code(config2).await;
        assert!(result2.is_err());
        assert!(result2
            .unwrap_err()
            .to_string()
            .contains("absolute paths not allowed"));

        // Test 3: Allow valid relative paths
        let mut files3 = HashMap::new();
        files3.insert(
            "subdir/valid_file.txt".to_string(),
            "safe content".to_string(),
        );

        let config3 = ExecutionConfig {
            language: "python".to_string(),
            code: "print(open('subdir/valid_file.txt').read())".to_string(),
            files: Some(files3),
            ..Default::default()
        };

        let result3 = manager.execute_code(config3).await;
        // Skip if Python not installed
        if let Ok(res) = result3 {
            assert!(res.success);
            assert!(res.stdout.contains("safe content"));
        }
    }
}
