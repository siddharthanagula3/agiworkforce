//! Hook executor for the UI hooks system.
//!
//! # Trust Model (Security)
//!
//! Hook commands are passed to `sh -c` (or `cmd /C` on Windows) unattended
//! whenever their event fires, so a hook has the same power as a command the
//! user runs in their own terminal, minus the env vars filtered out by
//! `sys::security::env_filter`. They reach this executor from exactly two
//! sources: the `hooks_add` / `hooks_update` / `hooks_import` Tauri commands,
//! and `~/.agiworkforce/hooks.yaml` via `hooks_initialize` / `hooks_reload`.
//!
//! Neither source is trusted to be the first-party UI, and neither is trusted
//! to be the user: every one of those commands shows the exact command in a
//! dialog the operating system draws and arms nothing without a yes given
//! there (see `sys/commands/hooks.rs`). That native dialog is the security
//! boundary. It is deliberately not the window's own confirmation channel:
//! the window renders model output, so a script injected into it could
//! answer that channel, and an IPC caller can pre-arm its auto-approve,
//! remembered-choice and session-approval shortcuts.
//!
//! [`validate_hook_command`] below is a literal-substring blocklist for
//! accidental paste errors only, it is trivially routed around and must never
//! be treated as the gate.

use super::types::{Hook, HookEvent, HookExecutionResult};
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

/// The event JSON also goes in `HOOK_EVENT_JSON` while it is at most this
/// long. A large tool result would otherwise exceed the OS limit on argument
/// and environment size (E2BIG) and the hook would never start; the full
/// event always arrives on stdin, as Claude Code, Codex and Gemini hooks
/// receive it.
const MAX_EVENT_ENV_BYTES: usize = 16 * 1024;

/// The exit code with which a hook refuses the action without printing JSON,
/// as in the CLI and Claude Code. Its stderr is the reason.
const BLOCKING_EXIT_CODE: i32 = 2;

fn first_line(text: &str) -> Option<&str> {
    text.lines().map(str::trim).find(|line| !line.is_empty())
}

/// A `{"decision": "block", "reason": "..."}` object on stdout, the CLI's
/// other way to refuse. Anything else on stdout decides nothing.
fn stdout_block_reason(stdout: &str) -> Option<Option<String>> {
    let parsed: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
    if parsed.get("decision").and_then(serde_json::Value::as_str) != Some("block") {
        return None;
    }
    Some(
        parsed
            .get("reason")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
    )
}

/// How a hook's run ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Ended {
    /// The process ran and was waited for. Without an exit code it was killed.
    Exited,
    /// It never ran: the pattern check refused the command, the sandbox could
    /// not be set up, or the process could not be spawned or waited for.
    NeverRan,
    TimedOut,
}

/// Why a hook did not run to an exit code of its own, or `None` when it did.
fn unfinished(result: &HookExecutionResult, ended: Ended) -> Option<String> {
    let reported = || result.error.as_deref().and_then(first_line);
    match ended {
        Ended::Exited if result.exit_code.is_some() => None,
        Ended::Exited => Some("it was killed before it finished".to_string()),
        Ended::NeverRan => Some(reported().unwrap_or("it could not be started").to_string()),
        Ended::TimedOut => Some(reported().unwrap_or("it ran out of time").to_string()),
    }
}

/// Decides whether a hook refuses its event.
///
/// A hook that ran to an exit code decides by the CLI's rules: exit code 2
/// refuses, with the first line of stderr as the reason, and so does a block
/// decision on stdout.
///
/// On the two gating events, `PreToolUse` and `UserPromptSubmit`, everything
/// else fails closed, because a guard that did not decide must not read as a
/// guard that allowed. A hook that did not run to completion, refused by the
/// pattern check, left without a sandbox, not spawned, out of time or killed,
/// refuses whatever it is marked. A hook that ran and failed with any other
/// code refuses unless it is marked to keep going on failure, which is the
/// only thing that mark decides there.
///
/// On every other event a failure refuses nothing.
fn settle(hook: &Hook, gating: bool, result: &mut HookExecutionResult, ended: Ended) {
    let unfinished = unfinished(result, ended);
    if unfinished.is_none() {
        if let Some(reason) = stdout_block_reason(&result.stdout) {
            result.blocked = true;
            result.block_reason =
                Some(reason.unwrap_or_else(|| format!("hook '{}' blocked the action", hook.name)));
            return;
        }
        if result.success {
            return;
        }
        if result.exit_code == Some(BLOCKING_EXIT_CODE) {
            result.blocked = true;
            result.block_reason = Some(
                first_line(&result.stderr)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("hook '{}' blocked the action", hook.name)),
            );
            return;
        }
    }
    if !gating {
        return;
    }
    let reason = match unfinished {
        Some(why) => format!("hook '{}' did not run to completion: {}", hook.name, why),
        None if hook.continue_on_error => return,
        None => {
            let code = result.exit_code.map_or_else(
                || "no exit code".to_string(),
                |code| format!("exit code {code}"),
            );
            match first_line(&result.stderr) {
                Some(said) => format!("hook '{}' failed ({}): {}", hook.name, code, said),
                None => format!("hook '{}' failed ({})", hook.name, code),
            }
        }
    };
    result.blocked = true;
    result.block_reason = Some(reason);
}

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

pub(super) fn with_added(armed: &[Hook], hook: Hook) -> Result<Vec<Hook>> {
    validate_hook_command(&hook.command)?;
    if armed.iter().any(|h| h.name == hook.name) {
        return Err(anyhow::anyhow!(
            "Hook with name '{}' already exists",
            hook.name
        ));
    }
    let mut next = armed.to_vec();
    next.push(hook);
    Ok(next)
}

pub(super) fn without(armed: &[Hook], name: &str) -> Result<Vec<Hook>> {
    let next: Vec<Hook> = armed.iter().filter(|h| h.name != name).cloned().collect();
    if next.len() == armed.len() {
        return Err(anyhow::anyhow!("Hook '{}' not found", name));
    }
    Ok(next)
}

/// The new command is checked before anything is built, so an update the
/// pattern check refuses leaves the old hook armed.
pub(super) fn with_updated(armed: &[Hook], hook: Hook) -> Result<Vec<Hook>> {
    validate_hook_command(&hook.command)?;
    let mut next = armed.to_vec();
    let Some(slot) = next.iter_mut().find(|h| h.name == hook.name) else {
        return Err(anyhow::anyhow!("Hook '{}' not found", hook.name));
    };
    *slot = hook;
    Ok(next)
}

pub(super) fn with_toggled(armed: &[Hook], name: &str, enabled: bool) -> Result<Vec<Hook>> {
    let mut next = armed.to_vec();
    let Some(hook) = next.iter_mut().find(|h| h.name == name) else {
        return Err(anyhow::anyhow!("Hook '{}' not found", name));
    };
    hook.enabled = enabled;
    Ok(next)
}

/// What a failed hook's error adds when the hook ran sandboxed: the sandbox
/// is the likeliest cause of a hook that worked before.
const SANDBOX_OPT_OUT: &str = "The hook ran in the OS sandbox, which lets it write only its \
     workspace; set AGIWORKFORCE_SANDBOX_HOOKS=0 to run hooks outside it";

pub struct HookExecutor {
    hooks: tokio::sync::RwLock<Vec<Hook>>,
    execution_stats: tokio::sync::RwLock<HashMap<String, HookStats>>,
    /// See [`crate::core::mcp::sandbox::hook_sandbox_enabled`].
    sandboxed: bool,
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
            sandboxed: crate::core::mcp::sandbox::hook_sandbox_enabled(),
        }
    }

    pub async fn load_hooks(&self, hooks: Vec<Hook>) {
        let mut hook_list = self.hooks.write().await;

        // A hook the pattern check refuses stays armed and never runs: each
        // time its event fires the check refuses it again, which on a gating
        // event refuses the action. Dropped here, a guard would vanish and
        // every action it guarded would go through.
        for hook in &hooks {
            if let Err(e) = validate_hook_command(&hook.command) {
                warn!(
                    "Hook '{}' will not run and refuses the events it gates: {}",
                    hook.name, e
                );
            }
        }

        *hook_list = hooks;
        self.sort_hooks_by_priority(&mut hook_list);
        info!("Loaded {} hooks", hook_list.len());
    }

    /// Changes the armed hooks only once the change has been saved. `change`
    /// works out the next set from the armed one and `save` writes it; if
    /// either fails the armed set is left exactly as it was. The lock is
    /// held across both, so no hook fires from, and no other change builds
    /// on, a set that was never written.
    pub(super) async fn commit<C, S, T>(&self, change: C, save: S) -> Result<T>
    where
        C: FnOnce(&[Hook]) -> Result<Vec<Hook>>,
        S: FnOnce(&[Hook]) -> Result<T>,
    {
        let mut armed = self.hooks.write().await;
        let mut next = change(&armed)?;
        self.sort_hooks_by_priority(&mut next);
        let saved = save(&next)?;
        *armed = next;
        Ok(saved)
    }

    pub async fn add_hook(&self, hook: Hook) -> Result<()> {
        self.commit(|armed| with_added(armed, hook), |_| Ok(()))
            .await
    }

    pub async fn remove_hook(&self, name: &str) -> Result<()> {
        self.commit(|armed| without(armed, name), |_| Ok(())).await
    }

    pub async fn update_hook(&self, hook: Hook) -> Result<()> {
        self.commit(|armed| with_updated(armed, hook), |_| Ok(()))
            .await
    }

    pub async fn toggle_hook(&self, name: &str, enabled: bool) -> Result<()> {
        self.commit(|armed| with_toggled(armed, name, enabled), |_| Ok(()))
            .await
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
            let result = match self.execute_single_hook(&hook, &event).await {
                Ok(result) => {
                    if result.success {
                        debug!("Hook '{}' succeeded", hook.name);
                    } else {
                        warn!(
                            "Hook '{}' failed with exit code: {:?}",
                            hook.name, result.exit_code
                        );
                    }
                    result
                }
                Err(e) => {
                    error!("Failed to execute hook '{}': {}", hook.name, e);
                    let mut result = HookExecutionResult {
                        hook_name: hook.name.clone(),
                        event_type: event.event_type.clone(),
                        success: false,
                        exit_code: None,
                        stdout: String::new(),
                        stderr: String::new(),
                        execution_time_ms: 0,
                        error: Some(e.to_string()),
                        blocked: false,
                        block_reason: None,
                    };
                    settle(
                        &hook,
                        event.event_type.is_gating(),
                        &mut result,
                        Ended::NeverRan,
                    );
                    result
                }
            };

            // On a gating event every hook is a guard in its own right, so a
            // failed one never keeps the guards after it from running.
            let stops_the_rest =
                !event.event_type.is_gating() && !hook.continue_on_error && !result.success;
            results.push(result);
            if stops_the_rest {
                break;
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
            ("/bin/sh", "-c")
        };

        let shell_args = vec![shell_arg.to_string(), hook.command.clone()];
        let hook_env = |name: &str| {
            hook.env
                .get(name)
                .filter(|_| !crate::sys::security::env_filter::is_blocked_env_var(name))
                .cloned()
                .or_else(|| std::env::var(name).ok())
        };
        let (program, program_args, scratch, on_host) = if self.sandboxed {
            let working_dir = hook
                .working_dir
                .as_ref()
                .map(std::path::PathBuf::from)
                .map(|dir| dir.canonicalize().unwrap_or(dir))
                .filter(|dir| crate::core::mcp::sandbox::is_safe_write_root(dir));
            let workspace = match working_dir {
                Some(dir) => dir,
                None => {
                    crate::core::mcp::sandbox::sandbox_workspace().map_err(anyhow::Error::msg)?
                }
            };
            match crate::core::mcp::sandbox::full_read_sandbox_program_guarding(
                shell,
                &shell_args,
                &workspace,
                &[],
                &crate::core::mcp::sandbox::protected_config_paths(),
                &crate::core::mcp::sandbox::credential_locations(),
                agiworkforce_sandbox_policy::NetworkPolicy::Allow,
                crate::core::mcp::sandbox::SandboxCaches::Shared,
                &hook_env,
            )
            .map_err(|e| {
                anyhow::anyhow!(
                    "Hook '{}' must run sandboxed: {}. {}",
                    hook.name,
                    e,
                    SANDBOX_OPT_OUT
                )
            })? {
                Some(wrapped) => (wrapped.program, wrapped.args, wrapped.scratch, false),
                None => (shell.to_string(), shell_args.clone(), None, true),
            }
        } else {
            (shell.to_string(), shell_args, None, true)
        };

        let mut cmd = Command::new(&program);
        // Outside a sandbox the hook finds programs only where no sandboxed
        // command can have put one; a hook's own `PATH` below still wins.
        if on_host {
            cmd.env("PATH", agiworkforce_sandbox_policy::host_path::host_path());
        }
        cmd.kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);
        cmd.args(&program_args)
            .env("HOOK_EVENT_TYPE", event.event_type.as_str())
            .env("HOOK_SESSION_ID", &event.session_id)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if event_json.len() <= MAX_EVENT_ENV_BYTES {
            cmd.env("HOOK_EVENT_JSON", &event_json);
        }

        if let Some(working_dir) = &hook.working_dir {
            cmd.current_dir(working_dir);
        }

        let mut dropped_env: Vec<&str> = Vec::new();
        for (key, value) in &hook.env {
            if crate::sys::security::env_filter::is_blocked_env_var(key) {
                dropped_env.push(key.as_str());
                continue;
            }
            cmd.env(key, value);
        }
        dropped_env.sort_unstable();

        if !dropped_env.is_empty() {
            warn!(
                "[HookExecutor] SECURITY: dropped env vars reserved by the app from hook '{}': {}",
                hook.name,
                dropped_env.join(", ")
            );
        }

        debug!("Executing hook '{}': {}", hook.name, hook.command);

        let timeout_duration = Duration::from_secs(hook.timeout_secs);
        let spawned = cmd.spawn().context("Failed to spawn hook process");
        let process_group = spawned.as_ref().ok().and_then(tokio::process::Child::id);
        let timeout_result = match spawned {
            Err(error) => Ok(Err(error)),
            Ok(mut child) => {
                let outcome = timeout(timeout_duration, async {
                    let stdin_handle = child.stdin.take();
                    let stdout_handle = child.stdout.take();
                    let stderr_handle = child.stderr.take();

                    // A hook that never reads stdin closes it, which is not an error.
                    let stdin_future = async {
                        if let Some(mut stdin) = stdin_handle {
                            let _ = stdin.write_all(event_json.as_bytes()).await;
                            let _ = stdin.shutdown().await;
                        }
                    };

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

                    let ((), stdout, stderr, status) =
                        tokio::join!(stdin_future, stdout_future, stderr_future, child.wait());

                    let status = status.context("Failed to wait for child process")?;

                    Ok::<_, anyhow::Error>((stdout, stderr, status))
                })
                .await;
                if outcome.is_err() {
                    kill_process_group(process_group).await;
                }
                outcome
            }
        };
        drop(scratch);

        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        let (mut result, ended) = match timeout_result {
            Ok(Ok((stdout, stderr, status))) => {
                let success = status.success();
                let exit_code = status.code();

                (
                    HookExecutionResult {
                        hook_name: hook.name.clone(),
                        event_type: event.event_type.clone(),
                        success,
                        exit_code,
                        stdout,
                        stderr,
                        execution_time_ms,
                        error: None,
                        blocked: false,
                        block_reason: None,
                    },
                    Ended::Exited,
                )
            }
            Ok(Err(e)) => (
                HookExecutionResult {
                    hook_name: hook.name.clone(),
                    event_type: event.event_type.clone(),
                    success: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    execution_time_ms,
                    error: Some(e.to_string()),
                    blocked: false,
                    block_reason: None,
                },
                Ended::NeverRan,
            ),
            Err(_) => (
                HookExecutionResult {
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
                    blocked: false,
                    block_reason: None,
                },
                Ended::TimedOut,
            ),
        };
        settle(hook, event.event_type.is_gating(), &mut result, ended);

        if self.sandboxed && !result.success && cfg!(any(target_os = "macos", target_os = "linux"))
        {
            result.error = Some(match result.error.take() {
                Some(error) => format!("{error}. {SANDBOX_OPT_OUT}"),
                None => SANDBOX_OPT_OUT.to_string(),
            });
        }

        if !dropped_env.is_empty() {
            result.stderr = format!(
                "[hooks] these environment variables are reserved by the app and were not passed to the hook: {}\n{}",
                dropped_env.join(", "),
                result.stderr
            );
        }

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

/// Kill the process group a timed-out hook leads, so nothing it started
/// outlives it. The group is signalled through `kill(1)`, since `kill(2)`
/// needs `unsafe`, and only while the hook itself is still unreaped, so the
/// group id cannot name another group yet.
#[cfg(unix)]
async fn kill_process_group(leader: Option<u32>) {
    let Some(leader) = leader else {
        return;
    };
    let group = format!("-{leader}");
    if let Some(program) = ["/bin/kill", "/usr/bin/kill"]
        .into_iter()
        .find(|program| std::path::Path::new(program).is_file())
    {
        let _ = Command::new(program)
            .args(["-KILL", "--", group.as_str()])
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
}

#[cfg(not(unix))]
async fn kill_process_group(_leader: Option<u32>) {}

impl Default for HookExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, unix))]
impl HookExecutor {
    /// An executor whose hooks run on the host, for tests that assert on what
    /// a hook itself did rather than on the sandbox.
    pub(super) fn unsandboxed() -> Self {
        Self {
            sandboxed: false,
            ..Self::new()
        }
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

    #[cfg(unix)]
    #[tokio::test]
    async fn blocked_env_vars_never_reach_the_hook_process() {
        let executor = HookExecutor {
            sandboxed: false,
            ..HookExecutor::new()
        };

        let mut env = HashMap::new();
        env.insert("LD_PRELOAD".to_string(), "/tmp/evil.so".to_string());
        env.insert(
            "dyld_insert_libraries".to_string(),
            "/tmp/evil.dylib".to_string(),
        );
        env.insert(
            "BASH_FUNC_ls%%".to_string(),
            "() { curl evil; }".to_string(),
        );
        env.insert("HOOK_SAFE_VAR".to_string(), "kept".to_string());

        let hook = Hook {
            name: "env_probe".to_string(),
            events: vec![HookEventType::SessionStart],
            priority: 50,
            command: "printf '%s|%s|' \"$LD_PRELOAD\" \"$HOOK_SAFE_VAR\"; env | grep -ic 'dyld_insert_libraries\\|bash_func' || true".to_string(),
            enabled: true,
            timeout_secs: 30,
            env,
            working_dir: None,
            continue_on_error: true,
        };

        executor.add_hook(hook).await.unwrap();

        let results = executor
            .execute_hooks(HookEvent::session_start(
                "session-1".to_string(),
                HashMap::new(),
            ))
            .await;

        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].stdout.trim_end(),
            "|kept|0",
            "library-injection env vars must be stripped from the hook process"
        );
        assert_eq!(
            results[0].stderr.lines().next(),
            Some("[hooks] these environment variables are reserved by the app and were not passed to the hook: BASH_FUNC_ls%%, LD_PRELOAD, dyld_insert_libraries"),
            "a dropped env var must be reported to the user, not only to the log"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_large_event_reaches_the_hook_on_stdin() {
        let executor = HookExecutor {
            sandboxed: false,
            ..HookExecutor::new()
        };
        let hook = Hook {
            name: "stdin_probe".to_string(),
            events: vec![HookEventType::PostToolUse],
            priority: 50,
            command: "printf '%s|' \"${HOOK_EVENT_JSON:-none}\"; wc -c".to_string(),
            enabled: true,
            timeout_secs: 30,
            env: HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        };
        executor.add_hook(hook).await.unwrap();

        let large_result = serde_json::json!({ "output": "x".repeat(4 * 1024 * 1024) });
        let event = HookEvent::post_tool_use(
            "session-1".to_string(),
            "terminal_execute".to_string(),
            "tool-1".to_string(),
            HashMap::new(),
            large_result,
            5,
        );
        let event_bytes = event.to_json().unwrap().len();
        let results = executor.execute_hooks(event).await;

        assert_eq!(results.len(), 1);
        assert!(results[0].success, "{:?}", results[0].error);
        let (env_value, stdin_bytes) = results[0].stdout.trim().split_once('|').unwrap();
        assert_eq!(env_value, "none");
        assert_eq!(stdin_bytes.trim().parse::<usize>().unwrap(), event_bytes);
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn a_hook_is_sandboxed_by_default_and_cannot_write_outside_its_workspace() {
        if crate::core::mcp::sandbox::detect_sandbox_backend().is_none() {
            return;
        }
        let workspace = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("escaped.txt");
        let executor = HookExecutor {
            sandboxed: true,
            ..HookExecutor::new()
        };
        executor
            .add_hook(Hook {
                name: "escape_probe".to_string(),
                events: vec![HookEventType::SessionStart],
                priority: 50,
                command: format!("echo escaped > '{}'", target.display()),
                enabled: true,
                timeout_secs: 30,
                env: HashMap::new(),
                working_dir: Some(workspace.path().to_string_lossy().to_string()),
                continue_on_error: true,
            })
            .await
            .unwrap();

        let results = executor
            .execute_hooks(HookEvent::session_start(
                "session-1".to_string(),
                HashMap::new(),
            ))
            .await;

        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(!target.exists());
        let error = results[0].error.as_deref().unwrap_or_default();
        assert!(
            error.contains("OS sandbox") && error.contains("AGIWORKFORCE_SANDBOX_HOOKS=0"),
            "a sandboxed hook's failure names the sandbox and the opt-out: {error}"
        );
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

    fn gate_hook(name: &str, command: &str, continue_on_error: bool) -> Hook {
        Hook {
            name: name.to_string(),
            events: vec![HookEventType::PreToolUse],
            priority: 50,
            command: command.to_string(),
            enabled: true,
            timeout_secs: 5,
            env: HashMap::new(),
            working_dir: None,
            continue_on_error,
        }
    }

    #[cfg(unix)]
    fn unsandboxed() -> HookExecutor {
        HookExecutor {
            sandboxed: false,
            ..HookExecutor::new()
        }
    }

    #[cfg(unix)]
    fn a_tool_call() -> HookEvent {
        HookEvent::pre_tool_use(
            "session-1".to_string(),
            "file_write".to_string(),
            "call-1".to_string(),
            HashMap::new(),
        )
    }

    fn finished(exit_code: Option<i32>, stdout: &str, stderr: &str) -> HookExecutionResult {
        HookExecutionResult {
            hook_name: "guard".to_string(),
            event_type: HookEventType::PreToolUse,
            success: exit_code == Some(0),
            exit_code,
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
            execution_time_ms: 1,
            error: None,
            blocked: false,
            block_reason: None,
        }
    }

    const GATED: bool = true;
    const OBSERVED: bool = false;

    #[test]
    fn exit_code_two_blocks_with_the_first_line_of_stderr() {
        let mut result = finished(Some(2), "", "\nno writes to main\nsecond line\n");
        settle(
            &gate_hook("guard", "true", true),
            GATED,
            &mut result,
            Ended::Exited,
        );

        assert!(result.blocked);
        assert_eq!(result.block_reason.as_deref(), Some("no writes to main"));
    }

    #[test]
    fn exit_code_two_without_stderr_still_blocks_and_names_the_hook() {
        let mut result = finished(Some(2), "", "");
        settle(
            &gate_hook("guard", "true", true),
            GATED,
            &mut result,
            Ended::Exited,
        );

        assert!(result.blocked);
        assert_eq!(
            result.block_reason.as_deref(),
            Some("hook 'guard' blocked the action")
        );
    }

    #[test]
    fn a_guard_that_ran_and_failed_blocks_unless_it_is_marked_to_keep_going() {
        for code in [1, 3, 126, 127] {
            let mut must_pass = finished(Some(code), "", "guard broke\nmore");
            settle(
                &gate_hook("guard", "true", false),
                GATED,
                &mut must_pass,
                Ended::Exited,
            );
            assert!(must_pass.blocked, "exit {code}");
            assert_eq!(
                must_pass.block_reason,
                Some(format!(
                    "hook 'guard' failed (exit code {code}): guard broke"
                ))
            );

            let mut optional = finished(Some(code), "", "guard broke");
            settle(
                &gate_hook("guard", "true", true),
                GATED,
                &mut optional,
                Ended::Exited,
            );
            assert!(!optional.blocked, "exit {code}");
            assert_eq!(optional.block_reason, None);
        }
    }

    #[test]
    fn a_successful_hook_does_not_block() {
        let mut result = finished(Some(0), "ok", "");
        settle(
            &gate_hook("guard", "true", false),
            GATED,
            &mut result,
            Ended::Exited,
        );
        assert!(!result.blocked);
    }

    #[test]
    fn a_block_decision_on_stdout_blocks_even_when_the_hook_exits_zero() {
        let hook = gate_hook("guard", "true", true);
        let mut result = finished(Some(0), r#"{"decision":"block","reason":"nope"}"#, "");
        settle(&hook, GATED, &mut result, Ended::Exited);
        assert!(result.blocked);
        assert_eq!(result.block_reason.as_deref(), Some("nope"));

        let mut other = finished(Some(0), r#"{"decision":"approve"}"#, "");
        settle(&hook, GATED, &mut other, Ended::Exited);
        assert!(!other.blocked);

        let mut prose = finished(Some(0), "decision: block", "");
        settle(&hook, GATED, &mut prose, Ended::Exited);
        assert!(!prose.blocked);
    }

    /// The five ways a guard ends without deciding, each as the executor
    /// reports it.
    fn did_not_run_to_completion() -> Vec<(&'static str, HookExecutionResult, Ended, &'static str)>
    {
        let never_ran = |error: &str| {
            let mut result = finished(None, "", "");
            result.error = Some(error.to_string());
            result
        };
        vec![
            (
                "refused by the pattern check",
                never_ran("Hook command blocked: contains dangerous pattern 'rm -rf /'"),
                Ended::NeverRan,
                "Hook command blocked: contains dangerous pattern 'rm -rf /'",
            ),
            (
                "left without a sandbox",
                never_ran("Hook 'guard' must run sandboxed: no backend"),
                Ended::NeverRan,
                "Hook 'guard' must run sandboxed: no backend",
            ),
            (
                "not spawned",
                never_ran("Failed to spawn hook process"),
                Ended::NeverRan,
                "Failed to spawn hook process",
            ),
            (
                "out of time",
                never_ran("Hook timed out after 5 seconds"),
                Ended::TimedOut,
                "Hook timed out after 5 seconds",
            ),
            (
                "killed",
                finished(None, "", ""),
                Ended::Exited,
                "it was killed before it finished",
            ),
        ]
    }

    #[test]
    fn a_guard_that_did_not_run_to_completion_blocks_whatever_it_is_marked() {
        for gating_event in [HookEventType::PreToolUse, HookEventType::UserPromptSubmit] {
            assert!(gating_event.is_gating());
            for continue_on_error in [true, false] {
                for (case, mut result, ended, why) in did_not_run_to_completion() {
                    result.event_type = gating_event.clone();
                    let mut hook = gate_hook("guard", "true", continue_on_error);
                    hook.events = vec![gating_event.clone()];

                    settle(&hook, gating_event.is_gating(), &mut result, ended);

                    assert!(
                        result.blocked,
                        "{case} on {}, keep going {continue_on_error}",
                        gating_event.as_str()
                    );
                    assert_eq!(
                        result.block_reason,
                        Some(format!("hook 'guard' did not run to completion: {why}")),
                        "{case}"
                    );
                }
            }
        }
    }

    #[test]
    fn off_the_gating_events_no_failure_blocks() {
        for continue_on_error in [true, false] {
            let hook = gate_hook("observer", "true", continue_on_error);
            for (case, mut result, ended, _) in did_not_run_to_completion() {
                settle(&hook, OBSERVED, &mut result, ended);
                assert!(!result.blocked, "{case}, keep going {continue_on_error}");
            }
            let mut failed = finished(Some(1), "", "broke");
            settle(&hook, OBSERVED, &mut failed, Ended::Exited);
            assert!(!failed.blocked, "keep going {continue_on_error}");
        }
    }

    #[tokio::test]
    async fn a_guard_the_pattern_check_refuses_stays_armed_and_blocks() {
        let executor = HookExecutor::new();
        executor
            .load_hooks(vec![gate_hook("wipe", "rm -rf / --no-preserve-root", true)])
            .await;
        assert_eq!(
            executor.list_hooks().await.len(),
            1,
            "a guard dropped at load would let everything it guarded through"
        );

        for event in [
            HookEvent::pre_tool_use(
                "session-1".to_string(),
                "file_write".to_string(),
                "call-1".to_string(),
                HashMap::new(),
            ),
            HookEvent::user_prompt_submit("session-1".to_string(), "hello".to_string(), None),
        ] {
            let mut hooks = executor.list_hooks().await;
            hooks[0].events = vec![event.event_type.clone()];
            executor.load_hooks(hooks).await;

            let results = executor.execute_hooks(event).await;

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].exit_code, None);
            assert!(results[0].blocked);
            let reason = results[0].block_reason.as_deref().unwrap_or_default();
            assert!(
                reason.starts_with("hook 'wipe' did not run to completion: Hook command blocked"),
                "{reason}"
            );
        }
    }

    #[cfg(unix)]
    fn a_prompt() -> HookEvent {
        HookEvent::user_prompt_submit("session-1".to_string(), "hello".to_string(), None)
    }

    #[cfg(unix)]
    fn on_both_gating_events(hook: Hook) -> Hook {
        Hook {
            events: vec![HookEventType::PreToolUse, HookEventType::UserPromptSubmit],
            ..hook
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_real_hook_blocks_with_exit_two_and_with_any_other_failure_it_must_pass() {
        let executor = unsandboxed();
        executor
            .add_hook(gate_hook(
                "refuse",
                "echo 'no writes to main' >&2; exit 2",
                true,
            ))
            .await
            .unwrap();
        let results = executor.execute_hooks(a_tool_call()).await;
        assert!(results[0].blocked);
        assert_eq!(
            results[0].block_reason.as_deref(),
            Some("no writes to main")
        );

        for (continue_on_error, blocks) in [(false, true), (true, false)] {
            let executor = unsandboxed();
            executor
                .add_hook(on_both_gating_events(gate_hook(
                    "broken",
                    "echo 'guard broke' >&2; exit 3",
                    continue_on_error,
                )))
                .await
                .unwrap();
            for event in [a_tool_call(), a_prompt()] {
                let results = executor.execute_hooks(event).await;
                assert_eq!(results[0].exit_code, Some(3));
                assert_eq!(results[0].blocked, blocks, "keep going {continue_on_error}");
            }
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_real_hook_that_runs_out_of_time_blocks_the_tool_and_the_prompt() {
        for continue_on_error in [true, false] {
            let executor = unsandboxed();
            let mut slow = on_both_gating_events(gate_hook("slow", "sleep 5", continue_on_error));
            slow.timeout_secs = 1;
            executor.add_hook(slow).await.unwrap();

            for event in [a_tool_call(), a_prompt()] {
                let results = executor.execute_hooks(event).await;

                assert!(!results[0].success);
                assert!(results[0].blocked, "keep going {continue_on_error}");
                assert_eq!(
                    results[0].block_reason.as_deref(),
                    Some("hook 'slow' did not run to completion: Hook timed out after 1 seconds")
                );
            }
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_real_hook_that_cannot_be_started_blocks_the_tool_and_the_prompt() {
        for continue_on_error in [true, false] {
            let executor = unsandboxed();
            let mut hook =
                on_both_gating_events(gate_hook("missing-folder", "true", continue_on_error));
            hook.working_dir = Some("/nonexistent/agiworkforce-hook-test".to_string());
            executor.add_hook(hook).await.unwrap();

            for event in [a_tool_call(), a_prompt()] {
                let results = executor.execute_hooks(event).await;

                assert_eq!(results[0].exit_code, None);
                assert!(results[0].blocked, "keep going {continue_on_error}");
            }
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_real_hook_that_is_killed_blocks_the_tool_and_the_prompt() {
        let executor = unsandboxed();
        executor
            .add_hook(on_both_gating_events(gate_hook(
                "killed",
                "kill -KILL $$",
                true,
            )))
            .await
            .unwrap();

        for event in [a_tool_call(), a_prompt()] {
            let results = executor.execute_hooks(event).await;

            assert_eq!(results[0].exit_code, None);
            assert!(results[0].blocked);
            assert_eq!(
                results[0].block_reason.as_deref(),
                Some("hook 'killed' did not run to completion: it was killed before it finished")
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn a_guard_whose_sandbox_cannot_be_set_up_blocks_or_runs_but_never_passes_unrun() {
        if crate::core::mcp::sandbox::detect_sandbox_backend().is_none() {
            return;
        }
        let executor = HookExecutor {
            sandboxed: true,
            ..HookExecutor::new()
        };
        let mut hook = on_both_gating_events(gate_hook("guard", "exit 2", true));
        hook.working_dir = Some("/nonexistent/agiworkforce-hook-test".to_string());
        executor.add_hook(hook).await.unwrap();

        for event in [a_tool_call(), a_prompt()] {
            let results = executor.execute_hooks(event).await;
            assert!(
                results[0].blocked,
                "whether the sandbox was built or not, the guard must refuse: {:?}",
                results[0].error
            );
        }
    }

    #[cfg(unix)]
    fn after_a_tool_call() -> HookEvent {
        HookEvent::post_tool_use(
            "session-1".to_string(),
            "file_write".to_string(),
            "call-1".to_string(),
            HashMap::new(),
            serde_json::Value::Null,
            1,
        )
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_failed_guard_blocks_and_every_guard_after_it_still_runs() {
        for failure in ["exit 1", "sleep 5"] {
            let executor = unsandboxed();
            let mut first = gate_hook("first", failure, false);
            first.priority = 1;
            first.timeout_secs = 1;
            executor.add_hook(first).await.unwrap();
            executor
                .add_hook(gate_hook("second", "echo 'not on main' >&2; exit 2", true))
                .await
                .unwrap();

            let results = executor.execute_hooks(a_tool_call()).await;

            assert_eq!(results.len(), 2, "{failure}: every guard must run");
            assert!(results[0].blocked, "{failure}");
            assert!(results[1].blocked, "{failure}");
            assert_eq!(results[1].block_reason.as_deref(), Some("not on main"));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn off_a_gating_event_a_failed_hook_that_must_run_stops_the_hooks_after_it() {
        let observer = |name: &str, command: &str, continue_on_error: bool, priority: u8| Hook {
            events: vec![HookEventType::PostToolUse],
            priority,
            ..gate_hook(name, command, continue_on_error)
        };

        let executor = unsandboxed();
        executor
            .add_hook(observer("first", "exit 1", false, 1))
            .await
            .unwrap();
        executor
            .add_hook(observer("second", "true", true, 50))
            .await
            .unwrap();
        let results = executor.execute_hooks(after_a_tool_call()).await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].hook_name, "first");

        let executor = unsandboxed();
        executor
            .add_hook(observer("first", "exit 1", true, 1))
            .await
            .unwrap();
        executor
            .add_hook(observer("second", "true", true, 50))
            .await
            .unwrap();
        assert_eq!(executor.execute_hooks(after_a_tool_call()).await.len(), 2);
    }

    #[test]
    fn only_the_tool_and_prompt_events_gate() {
        let gating: Vec<HookEventType> = HookEventType::all()
            .into_iter()
            .filter(HookEventType::is_gating)
            .collect();
        assert_eq!(
            gating,
            vec![HookEventType::PreToolUse, HookEventType::UserPromptSubmit]
        );
    }
}
