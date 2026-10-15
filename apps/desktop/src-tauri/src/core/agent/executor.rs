use super::*;
use crate::automation::browser::PlaywrightBridge;
use crate::core::llm::tool_executor::{truncated_for_chat, FILE_READ_MAX_BYTES};
use crate::sys::security::ToolExecutionGuard;

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex as TokioMutex;
use tokio::time::timeout;

/// Agent tasks are planned by a model and run with nobody there to approve an
/// action: every step meets the unattended tool rule before it is dispatched
/// here. They name no app for the per-app gate to judge,
/// so desktop input is left to computer use, which asks for consent and for
/// each app before it acts.
const AGENT_DESKTOP_INPUT_REFUSED: &str = "Agent tasks do not click, type, scroll or press keys on this computer. Use computer use for desktop control; it asks before it acts in each app.";

/// Opens a URL in the default browser. The launcher receives the URL as one
/// argument or one environment value on every platform and never as shell
/// text, so `&`, `|` or `^` in a query string start nothing.
fn open_url_with_platform(url: &str) -> Result<()> {
    open::that_detached(url).map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))
}

/// A file step with its path made absolute against the project folder, by
/// the resolver chat and goal runs use. The agent loop calls this once,
/// before it checks the granted folders and before it runs the step, so both
/// name the same file. Without a project folder a relative path is left as it
/// is and refused.
pub fn step_in_folder(action: &Action, project_folder: Option<&std::path::Path>) -> Action {
    let absolute = |path: &str| ToolExecutionGuard::absolute_path_argument(path, project_folder);
    match action {
        Action::ReadFile { path } => Action::ReadFile {
            path: absolute(path),
        },
        Action::WriteFile { path, content } => Action::WriteFile {
            path: absolute(path),
            content: content.clone(),
        },
        other => other.clone(),
    }
}

/// [`step_in_folder`] for the project the person has open.
pub async fn step_in_project(app_handle: Option<&tauri::AppHandle>, action: &Action) -> Action {
    let project_folder = crate::core::agi::executor::run_project_folder(app_handle).await;
    step_in_folder(action, project_folder.as_deref())
}

fn read_file_for_step(path: &std::path::Path) -> Result<String> {
    let size = std::fs::metadata(path)?.len();
    if size > FILE_READ_MAX_BYTES {
        return Err(anyhow::anyhow!(
            "{} is {} bytes; a step reads files up to {} bytes",
            path.display(),
            size,
            FILE_READ_MAX_BYTES
        ));
    }
    Ok(truncated_for_chat(std::fs::read_to_string(path)?))
}

fn command_line(command: &str, args: &[String]) -> String {
    if args.is_empty() {
        command.to_string()
    } else {
        format!("{} {}", command, args.join(" "))
    }
}

/// What a `PreToolUse` hook is told about an agent action, under the tool
/// name the chat tools use for the same thing where there is one, so a guard
/// written for chat holds here too.
fn hook_call(action: &Action) -> (String, HashMap<String, serde_json::Value>) {
    let mut parameters: HashMap<String, serde_json::Value> = match serde_json::to_value(action) {
        Ok(serde_json::Value::Object(fields)) => fields.into_iter().collect(),
        _ => HashMap::new(),
    };
    let kind = parameters.remove("type");
    let tool_name = match action {
        Action::ExecuteCommand { command, args } => {
            parameters.insert(
                "command".to_string(),
                serde_json::Value::String(command_line(command, args)),
            );
            "terminal_execute".to_string()
        }
        Action::ReadFile { .. } => "file_read".to_string(),
        Action::WriteFile { .. } => "file_write".to_string(),
        Action::Navigate { .. } => "browser_navigate".to_string(),
        _ => kind
            .as_ref()
            .and_then(serde_json::Value::as_str)
            .unwrap_or("agent_action")
            .to_string(),
    };
    (tool_name, parameters)
}

/// The tool guard call an action answers to: the chat tool whose path, URL and
/// command rules cover it, with only the parameters that tool's policy names.
/// Waiting for an element and searching the screen for text read the screen
/// through the vision service and take no path, URL or command, so the guard
/// has no rule for them. Desktop input never runs here at all. A command runs
/// as an argument vector, which [`guard_refusal`] judges as one.
fn guard_call(action: &Action) -> Option<(&'static str, serde_json::Value)> {
    match action {
        Action::ReadFile { path } => Some(("file_read", serde_json::json!({ "path": path }))),
        Action::WriteFile { path, content } => Some((
            "file_write",
            serde_json::json!({ "path": path, "content": content }),
        )),
        Action::Navigate { url } => Some(("browser_navigate", serde_json::json!({ "url": url }))),
        Action::Screenshot { region } => {
            Some(("ui_screenshot", serde_json::json!({ "region": region })))
        }
        Action::ExecuteCommand { .. }
        | Action::WaitForElement { .. }
        | Action::SearchText { .. }
        | Action::Click { .. }
        | Action::Type { .. }
        | Action::Scroll { .. }
        | Action::PressKey { .. } => None,
    }
}

/// Why the tool guard refuses an action, if it does. The step spawns the
/// program with its arguments and no shell, so the command is judged as that
/// vector: a `;` in a commit message or an `&` in a URL is text, and a vector
/// that names a shell is still judged as shell text.
///
/// Whether a file sits in a folder the user granted is decided by the agent
/// loop before it dispatches the step, against the app's own grants. The
/// guard here applies every other path rule; deciding grants again from a
/// guard that holds none would refuse an Allowed Directory outside home.
async fn guard_refusal(guard: &ToolExecutionGuard, action: &Action) -> Option<String> {
    let judged = match action {
        Action::ExecuteCommand { command, args } => guard.validate_argv(command, args),
        other => match guard_call(other) {
            Some((guarded_as, parameters)) => {
                guard
                    .validate_before_folder_consent(guarded_as, &parameters)
                    .await
            }
            None => Ok(()),
        },
    };
    judged.err().map(|refusal| refusal.to_string())
}

pub struct TaskExecutor {
    /// Optional CDP-controlled browser bridge for navigating within the same
    /// browser instance that subsequent click/type actions will target.
    /// When `None`, navigation falls back to OS-level `open` (BUG-07 fallback).
    browser_bridge: Option<Arc<TokioMutex<PlaywrightBridge>>>,
}

impl TaskExecutor {
    pub fn new(browser_bridge: Option<Arc<TokioMutex<PlaywrightBridge>>>) -> Result<Self> {
        Ok(Self { browser_bridge })
    }

    pub async fn execute_step(
        &self,
        step: &TaskStep,
        vision: &VisionAutomation,
    ) -> Result<StepResult> {
        let start = Instant::now();
        tracing::info!(
            "[Executor] Executing step {}: {}",
            step.id,
            step.description
        );

        // Pre-flight: check vision capabilities before executing, so we fail
        // fast with a clear error instead of entering a polling loop that hangs.
        if let Err(e) = VisionAutomation::check_vision_capability(&step.action) {
            return Ok(StepResult {
                step_id: step.id.clone(),
                success: false,
                result: None,
                error: Some(e.to_string()),
                screenshot_path: None,
                duration: start.elapsed(),
            });
        }

        let (tool_name, parameters) = hook_call(&step.action);
        if let Err(refusal) = crate::ui::hooks::gate_tool_use(&tool_name, parameters).await {
            return Ok(StepResult {
                step_id: step.id.clone(),
                success: false,
                result: None,
                error: Some(refusal),
                screenshot_path: None,
                duration: start.elapsed(),
            });
        }

        // A guard of its own for each step: the path, URL and command rules
        // apply, and the per-minute limits tuned for chat turns do not start
        // failing a plan that takes many screenshots.
        if let Some(refusal) = guard_refusal(&ToolExecutionGuard::new(), &step.action).await {
            return Ok(StepResult {
                step_id: step.id.clone(),
                success: false,
                result: None,
                error: Some(refusal),
                screenshot_path: None,
                duration: start.elapsed(),
            });
        }

        let result = timeout(step.timeout, self.execute_action(&step.action, vision)).await;

        match result {
            Ok(Ok(action_result)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: true,
                    result: Some(action_result),
                    error: None,
                    screenshot_path: None,
                    duration,
                })
            }
            Ok(Err(e)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(e.to_string()),
                    screenshot_path: None,
                    duration,
                })
            }
            Err(_) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(format!("Step timed out after {:?}", step.timeout)),
                    screenshot_path: None,
                    duration,
                })
            }
        }
    }

    async fn execute_action(&self, action: &Action, vision: &VisionAutomation) -> Result<String> {
        match action {
            Action::Screenshot { region } => {
                let path = vision.capture_screenshot(region.clone()).await?;
                Ok(format!("Screenshot saved to {}", path))
            }
            Action::Click { .. }
            | Action::Type { .. }
            | Action::Scroll { .. }
            | Action::PressKey { .. } => Err(anyhow::anyhow!(AGENT_DESKTOP_INPUT_REFUSED)),
            Action::Navigate { url } => {
                let parsed =
                    url::Url::parse(url).map_err(|_| anyhow::anyhow!("Invalid URL: {}", url))?;
                let safe_url = parsed.as_str();

                // Try CDP-controlled navigation first so subsequent actions
                // (click, type, screenshot) target the same browser page.
                if let Some(ref bridge) = self.browser_bridge {
                    let bridge_guard = bridge.lock().await;
                    match bridge_guard.navigate(safe_url).await {
                        Ok(()) => {
                            tracing::info!(
                                "[Executor] Navigated via CDP: {}{}",
                                parsed.origin().ascii_serialization(),
                                parsed.path()
                            );
                            return Ok(format!("Navigated (CDP): {}", safe_url));
                        }
                        Err(e) => {
                            tracing::warn!(
                                "[Executor] CDP navigation failed ({}), \
                                 falling back to OS open",
                                e
                            );
                            // Fall through to OS-level open below
                        }
                    }
                } else {
                    tracing::warn!(
                        "[Executor] No PlaywrightBridge available, \
                         falling back to OS open"
                    );
                }

                open_url_with_platform(safe_url)?;
                Ok(format!("Navigated (OS fallback): {}", safe_url))
            }
            Action::WaitForElement {
                target,
                timeout: wait_timeout,
            } => {
                vision.wait_for_element(target, *wait_timeout).await?;
                Ok("Element appeared".to_string())
            }
            Action::ExecuteCommand { command, args } => {
                use tokio::process::Command;
                use tokio::time::{timeout, Duration};

                tracing::info!(
                    "Executing command: {} with {} argument(s)",
                    command,
                    args.len()
                );

                let mut cmd = Command::new(command);
                cmd.args(args);
                cmd.kill_on_drop(true);

                let result = timeout(Duration::from_secs(30), cmd.output()).await;

                match result {
                    Ok(Ok(output)) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let status = output.status;

                        if status.success() {
                            tracing::debug!(
                                "Command succeeded: {} byte(s) of output",
                                stdout.len()
                            );
                            Ok(format!(
                                "Command executed successfully\nOutput: {}",
                                stdout.trim()
                            ))
                        } else {
                            tracing::warn!(
                                "Command failed with status {:?}: {} byte(s) on stderr",
                                status,
                                stderr.len()
                            );
                            Err(anyhow::anyhow!(
                                "Command failed with status {:?}\nError: {}",
                                status,
                                stderr
                            ))
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::error!("Failed to execute command: {}", e);
                        Err(anyhow::anyhow!("Failed to execute command: {}", e))
                    }
                    Err(_) => {
                        tracing::error!("Command execution timed out after 30 seconds");
                        Err(anyhow::anyhow!(
                            "Command execution timed out after 30 seconds"
                        ))
                    }
                }
            }
            Action::ReadFile { path } => {
                // BUG-01 fix: canonicalize and reject sensitive system paths
                let canonical = Self::validate_file_path(path)?;
                read_file_for_step(&canonical)
            }
            Action::WriteFile { path, content } => {
                // BUG-01 fix: validate destination before writing
                let canonical = Self::validate_write_path(path)?;
                std::fs::write(&canonical, content)?;
                Ok(format!(
                    "Wrote {} bytes to {}",
                    content.len(),
                    canonical.display()
                ))
            }
            Action::SearchText { query } => {
                let elements = vision.search_text(query).await?;
                Ok(format!(
                    "Found {} elements matching '{}'",
                    elements.len(),
                    query
                ))
            }
        }
    }

    pub(crate) fn validate_file_path(path: &str) -> Result<std::path::PathBuf> {
        if path.contains('\0') {
            return Err(anyhow::anyhow!("Invalid path: contains null bytes"));
        }
        let canonical =
            std::fs::canonicalize(path).map_err(|e| anyhow::anyhow!("Path inaccessible: {}", e))?;
        Self::check_blocked_prefix(&canonical)?;
        Ok(canonical)
    }

    pub(crate) fn validate_write_path(path: &str) -> Result<std::path::PathBuf> {
        if path.contains('\0') {
            return Err(anyhow::anyhow!("Invalid path: contains null bytes"));
        }
        let p = std::path::Path::new(path);
        // Reject any path component that is ".."
        for component in p.components() {
            if component == std::path::Component::ParentDir {
                return Err(anyhow::anyhow!("Path traversal rejected: '..' not allowed"));
            }
        }
        let resolved = if p.is_absolute() {
            p.to_path_buf()
        } else {
            std::env::current_dir()?.join(p)
        };

        // Walk up from the full path until we find an existing ancestor,
        // canonicalize it (resolving symlinks), then re-append the tail.
        let mut tail: Vec<std::ffi::OsString> = Vec::new();
        let mut tmp = resolved.as_path();
        let real = loop {
            match std::fs::canonicalize(tmp) {
                Ok(canon) => {
                    let mut r = canon;
                    for part in tail.iter().rev() {
                        r.push(part);
                    }
                    break r;
                }
                Err(error) => {
                    let absent = matches!(
                        std::fs::symlink_metadata(tmp),
                        Err(ref metadata_error)
                            if metadata_error.kind() == std::io::ErrorKind::NotFound
                    );
                    if error.kind() != std::io::ErrorKind::NotFound || !absent {
                        return Err(anyhow::anyhow!("Path cannot be safely resolved: {}", error));
                    }
                    let name = tmp
                        .file_name()
                        .ok_or_else(|| anyhow::anyhow!("Path has no resolvable ancestor"))?;
                    tail.push(name.to_owned());
                    tmp = tmp
                        .parent()
                        .ok_or_else(|| anyhow::anyhow!("Path has no resolvable ancestor"))?;
                }
            }
        };

        Self::check_blocked_prefix(&real)?;
        Ok(real)
    }

    fn check_blocked_prefix(path: &std::path::Path) -> Result<()> {
        #[cfg(not(target_os = "windows"))]
        const BLOCKED: &[&str] = &[
            "/etc", "/proc", "/sys", "/dev", "/boot", "/root", "/usr", "/var", "/sbin", "/bin",
        ];

        #[cfg(target_os = "windows")]
        const BLOCKED: &[&str] = &[
            "C:\\Windows",
            "C:\\Program Files",
            "C:\\Program Files (x86)",
            "C:\\ProgramData",
            "C:\\Users\\Default",
        ];

        for prefix in BLOCKED {
            if crate::sys::security::blocked_paths::path_is_within(
                path,
                std::path::Path::new(prefix),
            ) {
                return Err(anyhow::anyhow!(
                    "Access denied: '{}' is a protected system path",
                    path.display()
                ));
            }
        }

        // Block sensitive directories under the user's home directory
        if let Some(home) = dirs::home_dir() {
            let home_blocked = vec![home.join(".ssh"), home.join(".gnupg"), home.join(".config")];

            #[cfg(target_os = "macos")]
            let home_blocked = {
                let mut v = home_blocked;
                v.push(home.join("Library"));
                v
            };

            for prefix in &home_blocked {
                if crate::sys::security::blocked_paths::path_is_within(
                    path,
                    std::path::Path::new(prefix),
                ) {
                    return Err(anyhow::anyhow!(
                        "Access denied: '{}' is a protected user path",
                        path.display()
                    ));
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outside_the_project(relative: &str) -> String {
        relative
            .split('/')
            .fold(
                std::path::PathBuf::from(if cfg!(windows) {
                    r"D:\agi-fixture"
                } else {
                    "/opt/agi-fixture"
                }),
                |path, name| path.join(name),
            )
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn a_shell_action_is_told_to_hooks_as_the_terminal_tool_with_its_whole_command_line() {
        let (tool_name, parameters) = hook_call(&Action::ExecuteCommand {
            command: "git".to_string(),
            args: vec!["push".to_string(), "--force".to_string()],
        });

        assert_eq!(tool_name, "terminal_execute");
        assert_eq!(parameters["command"], "git push --force");
        assert!(!parameters.contains_key("type"));
    }

    #[tokio::test]
    async fn a_relative_file_step_is_read_inside_the_project_and_cannot_climb_out_of_it() {
        let project = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir(project.path().join("notes")).expect("folder");
        std::fs::write(project.path().join("notes").join("today.txt"), "ship it").expect("write");
        let guard = ToolExecutionGuard::new();

        let relative = Action::ReadFile {
            path: "notes/today.txt".to_string(),
        };
        assert!(
            guard_refusal(&guard, &relative).await.is_some(),
            "the guard never guesses what a relative path is relative to"
        );

        let resolved = step_in_folder(&relative, Some(project.path()));
        let Action::ReadFile { path } = &resolved else {
            panic!("a read step stays a read step");
        };
        assert_eq!(
            std::path::Path::new(path),
            project.path().join("notes").join("today.txt")
        );
        assert_eq!(guard_refusal(&guard, &resolved).await, None);
        assert_eq!(
            read_file_for_step(std::path::Path::new(path)).expect("read"),
            "ship it"
        );

        for escaping in ["../outside.txt", "notes/../../outside.txt"] {
            let write = step_in_folder(
                &Action::WriteFile {
                    path: escaping.to_string(),
                    content: "x".to_string(),
                },
                Some(project.path()),
            );
            assert!(
                guard_refusal(&guard, &write).await.is_some(),
                "{escaping} leaves the project"
            );
        }

        let elsewhere = outside_the_project("elsewhere/a.txt");
        let already_absolute = Action::ReadFile {
            path: elsewhere.clone(),
        };
        let Action::ReadFile { path } = step_in_folder(&already_absolute, Some(project.path()))
        else {
            panic!("a read step stays a read step");
        };
        assert_eq!(path, elsewhere);
        let Action::ReadFile { path } = step_in_folder(&relative, None) else {
            panic!("a read step stays a read step");
        };
        assert_eq!(path, "notes/today.txt", "no folder, no guess");
    }

    #[test]
    fn reading_a_file_returns_what_is_in_it_cut_to_the_chat_limit() {
        let dir = tempfile::tempdir().expect("tempdir");
        let short = dir.path().join("short.txt");
        std::fs::write(&short, "first line\nsecond line").expect("write");
        assert_eq!(
            read_file_for_step(&short).expect("read"),
            "first line\nsecond line"
        );

        let long = dir.path().join("long.txt");
        std::fs::write(&long, "é".repeat(150_000)).expect("write");
        let read = read_file_for_step(&long).expect("read");
        assert!(read.starts_with("ééé"));
        assert!(read.contains("[truncated to first 200000 chars out of 300000]"));
        assert!(read.len() < 200_100);
    }

    #[test]
    fn file_and_browser_actions_use_the_chat_tool_names() {
        let (read, read_parameters) = hook_call(&Action::ReadFile {
            path: "/etc/hosts".to_string(),
        });
        let (write, _) = hook_call(&Action::WriteFile {
            path: "/tmp/a".to_string(),
            content: "x".to_string(),
        });
        let (navigate, navigate_parameters) = hook_call(&Action::Navigate {
            url: "https://example.com".to_string(),
        });

        assert_eq!(read, "file_read");
        assert_eq!(read_parameters["path"], "/etc/hosts");
        assert_eq!(write, "file_write");
        assert_eq!(navigate, "browser_navigate");
        assert_eq!(navigate_parameters["url"], "https://example.com");
    }

    #[test]
    fn every_other_action_is_named_by_its_own_kind() {
        let (tool_name, parameters) = hook_call(&Action::SearchText {
            query: "invoice".to_string(),
        });

        assert_eq!(tool_name, "searchText");
        assert_eq!(parameters["query"], "invoice");
    }

    fn step(action: Action) -> TaskStep {
        TaskStep {
            id: "step-1".to_string(),
            action,
            description: "guarded step".to_string(),
            expected_result: None,
            timeout: std::time::Duration::from_secs(5),
            retry_on_failure: false,
        }
    }

    #[tokio::test]
    async fn a_step_the_tool_guard_refuses_never_runs() {
        let executor = TaskExecutor::new(None).expect("executor");
        let vision = VisionAutomation::new().expect("vision");

        for (action, refused_for) in [
            (
                Action::Navigate {
                    url: "http://127.0.0.1:8080/admin".to_string(),
                },
                "Blocked domain",
            ),
            (
                Action::Navigate {
                    url: "file:///etc/passwd".to_string(),
                },
                "Insecure protocol",
            ),
            (
                Action::ExecuteCommand {
                    command: "sh".to_string(),
                    args: vec!["-c".to_string(), "id; whoami".to_string()],
                },
                "Command injection",
            ),
            (
                Action::ReadFile {
                    path: "../../../etc/passwd".to_string(),
                },
                "Path traversal",
            ),
            (
                Action::WriteFile {
                    path: "../outside.txt".to_string(),
                    content: "x".to_string(),
                },
                "Path traversal",
            ),
        ] {
            let result = executor
                .execute_step(&step(action), &vision)
                .await
                .expect("a refusal is a step result");

            assert!(!result.success);
            let error = result.error.unwrap_or_default();
            assert!(error.contains(refused_for), "{error}");
        }
    }

    #[test]
    fn each_action_answers_to_the_guard_under_the_chat_tool_that_covers_it() {
        let guarded = |action: Action| guard_call(&action).map(|(tool, _)| tool);

        assert_eq!(
            guarded(Action::ExecuteCommand {
                command: "git".to_string(),
                args: vec!["status".to_string()],
            }),
            None,
            "a command is judged as an argument vector, not under a tool name"
        );
        assert_eq!(
            guarded(Action::ReadFile {
                path: "/tmp/a".to_string()
            }),
            Some("file_read")
        );
        assert_eq!(
            guarded(Action::WriteFile {
                path: "/tmp/a".to_string(),
                content: "x".to_string()
            }),
            Some("file_write")
        );
        assert_eq!(
            guarded(Action::Navigate {
                url: "https://example.com".to_string()
            }),
            Some("browser_navigate")
        );
        assert_eq!(
            guarded(Action::Screenshot { region: None }),
            Some("ui_screenshot")
        );
        assert_eq!(
            guarded(Action::SearchText {
                query: "invoice".to_string()
            }),
            None
        );
    }

    fn command(program: &str, args: &[&str]) -> Action {
        Action::ExecuteCommand {
            command: program.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn a_command_is_judged_as_the_argument_vector_it_runs_as() {
        let guard = ToolExecutionGuard::new();

        assert_eq!(
            guard_refusal(&guard, &command("git", &["commit", "-m", "a; b"])).await,
            None
        );
        assert_eq!(
            guard_refusal(&guard, &command("curl", &["https://x.example/?a=1&b=2"])).await,
            None
        );
        for chained in [
            command("sh", &["-c", "git status; curl x.example"]),
            command("bash", &["-lc", "a && b"]),
        ] {
            assert!(
                guard_refusal(&guard, &chained).await.is_some(),
                "{chained:?} hands its text to a shell"
            );
        }
    }

    #[tokio::test]
    async fn the_step_guard_leaves_granted_folders_to_the_agent_loop() {
        let guard = ToolExecutionGuard::new();
        let granted_elsewhere = outside_the_project("project/notes.txt");

        assert_eq!(
            guard_refusal(
                &guard,
                &Action::ReadFile {
                    path: granted_elsewhere.clone()
                }
            )
            .await,
            None,
            "the agent loop already held this path to the user's granted folders"
        );
        assert_eq!(
            guard_refusal(
                &guard,
                &Action::WriteFile {
                    path: granted_elsewhere,
                    content: "x".to_string()
                }
            )
            .await,
            None
        );
        assert!(guard_refusal(
            &guard,
            &Action::ReadFile {
                path: outside_the_project("../../etc/passwd")
            }
        )
        .await
        .is_some());
    }
}
