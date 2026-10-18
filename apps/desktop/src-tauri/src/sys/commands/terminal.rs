use crate::features::terminal::{
    detect_available_shells, get_default_shell, SessionManager, ShellInfo, ShellType, TerminalAI,
};
use crate::sys::native_confirm::{shown_value, ConfirmGate, NativeConfirm};
use crate::sys::security::command_validator::{
    reject_if_root, validate_command, write_security_audit_log, ValidationConfig,
};
use crate::sys::security::log_redaction::redact_secrets;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
    stream_id: Option<String>,
}

fn reject_unquoted_shell_metachars(command: &str) -> Result<(), String> {
    let tokens = shlex::split(command)
        .ok_or_else(|| "command failed shell-tokenization (unbalanced quotes)".to_string())?;
    let banned_single = [';', '|', '<', '>', '`'];
    for tok in &tokens {
        if tok.chars().any(|c| banned_single.contains(&c))
            || tok.contains("&&")
            || tok.contains("||")
            || tok.contains("$(")
            || tok == "&"
        {
            return Err(format!(
                "Refusing command containing unquoted shell metacharacters: {:?}",
                tok
            ));
        }
    }
    Ok(())
}

fn parse_shell_type(input: &str) -> Result<ShellType, String> {
    let normalized = input.trim().to_lowercase();
    match normalized.as_str() {
        "" | "default" | "auto" => Ok(get_default_shell()),
        "powershell" | "pwsh" => Ok(ShellType::PowerShell),
        "cmd" | "commandprompt" => Ok(ShellType::Cmd),
        "wsl" => Ok(ShellType::Wsl),
        "gitbash" | "git-bash" => Ok(ShellType::GitBash),
        "zsh" => Ok(ShellType::Zsh),
        "bash" => Ok(ShellType::Bash),
        "fish" => Ok(ShellType::Fish),
        "sh" => Ok(ShellType::Sh),
        _ => Err(format!(
            "Invalid shell type: {}. Allowed values: default, zsh, bash, fish, sh, powershell, cmd, wsl, gitbash",
            input
        )),
    }
}

/// Runs one command for a tool call that arrived through this app's own MCP
/// server. It is not registered for the page: the page has the terminal
/// panel, which is the person's own shell behind its own native question.
pub async fn execute_terminal_command(
    app: AppHandle,
    command: String,
    cwd: Option<String>,
    shell: Option<String>,
    stream_id: Option<String>,
    emit_events: Option<bool>,
    timeout_ms: Option<u64>,
) -> Result<ExecuteResult, String> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    // Generate correlation ID for request tracing
    let correlation_id = uuid::Uuid::new_v4().to_string();

    tracing::info!(
        correlation_id = %correlation_id,
        command = %redact_secrets(&command),
        "Executing independent terminal command"
    );

    if let Err(e) = reject_if_root() {
        return Err(e.to_string());
    }

    // Logged before validation so refused attempts are recorded too.
    write_security_audit_log(&command, cwd.as_deref());

    // Use centralized command validation (one-shot mode - strictest)
    let config = ValidationConfig::oneshot().with_correlation_id(&correlation_id);

    if let Err(e) = validate_command(&command, &config) {
        tracing::warn!(
            correlation_id = %correlation_id,
            error = %e,
            "Command validation failed"
        );
        return Err(e.to_string());
    }

    if let Err(e) = reject_unquoted_shell_metachars(&command) {
        tracing::warn!(correlation_id = %correlation_id, error = %e, "metachar reject");
        return Err(e);
    }

    let confirmation_args = serde_json::json!({
        "command": command,
        "cwd": cwd,
        "shell": shell,
    });

    crate::ui::hooks::gate_tool_use(
        "terminal_execute",
        std::collections::HashMap::from([
            ("command".to_string(), serde_json::json!(command)),
            ("cwd".to_string(), serde_json::json!(cwd)),
            ("shell".to_string(), serde_json::json!(shell)),
        ]),
    )
    .await?;

    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "terminal_execute",
        &confirmation_args,
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    let requested_cwd = cwd
        .map(|dir| {
            std::path::absolute(dir).map_err(|e| format!("Invalid working directory: {}", e))
        })
        .transpose()?;

    let shell = shell.unwrap_or_else(|| match get_default_shell() {
        ShellType::PowerShell => "powershell".to_string(),
        ShellType::Cmd => "cmd".to_string(),
        ShellType::Zsh => "zsh".to_string(),
        ShellType::Bash => "bash".to_string(),
        ShellType::Fish => "fish".to_string(),
        ShellType::Sh => "sh".to_string(),
        ShellType::Wsl => "wsl".to_string(),
        ShellType::GitBash => "gitbash".to_string(),
    });

    // Proper shell routing that honors requested shell
    // and doesn't select powershell.exe on non-Windows for unknown shells
    let (program, args): (String, Vec<String>) = match shell.to_lowercase().as_str() {
        "cmd" => (
            "cmd.exe".to_string(),
            vec!["/C".to_string(), command.clone()],
        ),
        "bash" => ("bash".to_string(), vec!["-lc".to_string(), command.clone()]),
        "zsh" => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
        "fish" => ("fish".to_string(), vec!["-c".to_string(), command.clone()]),
        "sh" => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
        "wsl" => (
            "wsl.exe".to_string(),
            vec!["bash".to_string(), "-lc".to_string(), command.clone()],
        ),
        "gitbash" => {
            // On Windows, resolve the full Git Bash executable path rather than relying
            // on bare "bash" being discoverable on %PATH%, which is not guaranteed.
            #[cfg(target_os = "windows")]
            {
                let git_bash_paths = [
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                ];
                let program = git_bash_paths
                    .iter()
                    .find(|p| std::path::Path::new(p).exists())
                    .map(|p| p.to_string())
                    .unwrap_or_else(|| "bash".to_string());
                (program, vec!["-lc".to_string(), command.clone()])
            }
            #[cfg(not(target_os = "windows"))]
            {
                // Git Bash is Windows-specific; fall back to bash on non-Windows
                ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
            }
        }
        "powershell" | "pwsh" => (
            if cfg!(target_os = "windows") {
                // Prefer PowerShell 7 (pwsh) when available; fall back to
                // legacy Windows PowerShell (powershell.exe).
                if which::which("pwsh").is_ok() {
                    "pwsh".to_string()
                } else {
                    "powershell.exe".to_string()
                }
            } else {
                "pwsh".to_string()
            },
            vec![
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                command.clone(),
            ],
        ),
        _ => {
            // Don't silently fall back to powershell.exe on non-Windows
            // Use system default shell for unknown shells instead
            match get_default_shell() {
                ShellType::PowerShell => (
                    if cfg!(target_os = "windows") {
                        // Prefer PowerShell 7 (pwsh) when available; fall back to
                        // legacy Windows PowerShell (powershell.exe).
                        if which::which("pwsh").is_ok() {
                            "pwsh".to_string()
                        } else {
                            "powershell.exe".to_string()
                        }
                    } else {
                        "pwsh".to_string()
                    },
                    vec![
                        "-NoLogo".to_string(),
                        "-NoProfile".to_string(),
                        "-Command".to_string(),
                        command.clone(),
                    ],
                ),
                ShellType::Bash => ("bash".to_string(), vec!["-lc".to_string(), command.clone()]),
                ShellType::Zsh => ("zsh".to_string(), vec!["-lc".to_string(), command.clone()]),
                ShellType::Fish => ("fish".to_string(), vec!["-c".to_string(), command.clone()]),
                ShellType::Sh => ("sh".to_string(), vec!["-c".to_string(), command.clone()]),
                ShellType::Cmd => (
                    "cmd.exe".to_string(),
                    vec!["/C".to_string(), command.clone()],
                ),
                ShellType::Wsl => (
                    "wsl.exe".to_string(),
                    vec!["bash".to_string(), "-lc".to_string(), command.clone()],
                ),
                ShellType::GitBash => {
                    #[cfg(target_os = "windows")]
                    {
                        let git_bash_paths = [
                            "C:\\Program Files\\Git\\bin\\bash.exe",
                            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
                        ];
                        let program = git_bash_paths
                            .iter()
                            .find(|p| std::path::Path::new(p).exists())
                            .map(|p| p.to_string())
                            .unwrap_or_else(|| "bash".to_string());
                        (program, vec!["-lc".to_string(), command.clone()])
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                    }
                }
            }
        }
    };

    let sandbox_launch = {
        let settings_state = app.state::<crate::sys::commands::settings::SettingsState>();
        let settings = settings_state.settings.lock().await;
        let execution_preferences = settings.execution_preferences.clone().unwrap_or_default();
        let allowed_directories = settings.allowed_directories.clone();
        drop(settings);

        crate::sys::security::sandbox_runtime::build_sandboxed_command(
            &program,
            &args,
            requested_cwd
                .as_ref()
                .map(|dir| dir.to_string_lossy())
                .as_deref(),
            &allowed_directories,
            &execution_preferences.terminal_sandbox,
        )?
    };

    // A sandbox holds the folder to where it first resolved, so only the
    // system's own links are followed on the way to it. Unsandboxed, the
    // command runs wherever the user's own link points, such as a folder
    // linked to another volume.
    let cwd = match requested_cwd {
        Some(absolute) => {
            let resolved = if sandbox_launch.is_some() {
                agiworkforce_sandbox_policy::host_path::resolve_root_for_use(&absolute)?
            } else {
                std::fs::canonicalize(&absolute).map_err(|e| {
                    format!("Invalid working directory {}: {}", absolute.display(), e)
                })?
            };
            if !resolved.is_dir() {
                return Err(format!(
                    "Invalid working directory: {} is not a folder",
                    resolved.display()
                ));
            }
            Some(resolved.to_string_lossy().to_string())
        }
        None => None,
    };

    let (launch_program, launch_args) = match sandbox_launch.as_ref() {
        Some(spec) => (&spec.program, &spec.args),
        None => (&program, &args),
    };

    let mut cmd = Command::new(launch_program);
    for arg in launch_args {
        cmd.arg(arg);
    }

    if let Some(ref path) = cwd {
        cmd.current_dir(path);
    }

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let start_time = Instant::now();
    let stream_id = stream_id.unwrap_or_else(|| format!("oneshot-{}", correlation_id));
    let emit_events = emit_events.unwrap_or(false);
    let output_event = format!("terminal-output-{}", stream_id);
    let exit_event = format!("terminal-exit-{}", stream_id);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_event = output_event.clone();
    let app_stdout = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stdout) = stdout_handle {
            let mut chunk = [0u8; 4096];
            loop {
                match stdout.read(&mut chunk).await {
                    Ok(0) => break,
                    Ok(n) => {
                        buffer.extend_from_slice(&chunk[..n]);
                        if emit_events {
                            let text = String::from_utf8_lossy(&chunk[..n]).to_string();
                            let _ = app_stdout.emit(
                                stdout_event.as_str(),
                                serde_json::json!({
                                    "stream": "stdout",
                                    "data": text
                                }),
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        buffer
    });

    let stderr_event = output_event.clone();
    let app_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stderr) = stderr_handle {
            let mut chunk = [0u8; 4096];
            loop {
                match stderr.read(&mut chunk).await {
                    Ok(0) => break,
                    Ok(n) => {
                        buffer.extend_from_slice(&chunk[..n]);
                        if emit_events {
                            let text = String::from_utf8_lossy(&chunk[..n]).to_string();
                            let _ = app_stderr.emit(
                                stderr_event.as_str(),
                                serde_json::json!({
                                    "stream": "stderr",
                                    "data": text
                                }),
                            );
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        buffer
    });

    let timeout_ms = timeout_ms.unwrap_or(60_000);
    let timeout_duration = tokio::time::Duration::from_millis(timeout_ms);
    let status = match tokio::time::timeout(timeout_duration, child.wait()).await {
        Ok(result) => result.map_err(|e| format!("Command failed: {}", e))?,
        Err(_) => {
            let _ = child.kill().await;
            return Err(format!("Command timed out after {} ms", timeout_ms));
        }
    };

    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_bytes = stderr_task.await.unwrap_or_default();
    let duration = start_time.elapsed();

    if emit_events {
        let _ = app.emit(
            exit_event.as_str(),
            serde_json::json!({ "exit_code": status.code() }),
        );
    }

    let sandbox_warnings: String = sandbox_launch
        .iter()
        .flat_map(|spec| spec.warnings.iter())
        .map(|warning| format!("{warning}\n"))
        .collect();
    Ok(ExecuteResult {
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: sandbox_warnings + &String::from_utf8_lossy(&stderr_bytes),
        exit_code: status.code(),
        duration_ms: duration.as_millis() as u64,
        stream_id: Some(stream_id),
    })
}

#[tauri::command]
pub async fn terminal_detect_shells() -> Result<Vec<ShellInfo>, String> {
    tracing::info!("Detecting available shells");
    let shells = detect_available_shells();
    tracing::info!("Found {} available shells", shells.len());
    Ok(shells)
}

/// One question about opening the terminal at a time, and a wait after a no.
static TERMINAL_DECISIONS: ConfirmGate = ConfirmGate::new();

/// Set by the person's yes to the first terminal of this app run, and never
/// saved: the next launch asks again.
static TERMINAL_OPENED_THIS_RUN: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

const NO_TERMINAL_OPENED: &str =
    "No terminal has been opened since the app started. Open one in the terminal panel first.";

/// The folder a new session starts in: the one asked for, resolved, or the
/// one this process runs in. The dialog names this folder and the session is
/// started in it, so the two cannot differ.
fn session_folder(cwd: Option<String>) -> Result<std::path::PathBuf, String> {
    let folder = match cwd.as_deref().map(str::trim).filter(|cwd| !cwd.is_empty()) {
        Some(cwd) => std::fs::canonicalize(cwd)
            .map_err(|error| format!("The folder {cwd} could not be opened: {error}"))?,
        None => std::env::current_dir()
            .map_err(|error| format!("The app's own folder could not be read: {error}"))?,
    };
    if !folder.is_dir() {
        return Err(format!("{} is not a folder.", folder.display()));
    }
    Ok(folder)
}

fn open_terminal_question(folder: &std::path::Path) -> NativeConfirm {
    NativeConfirm {
        title: "Open a terminal?".to_string(),
        body: format!(
            "Open a terminal in {}?\n\nCommands typed there run as you, outside the sandbox. This is asked once each time the app runs.",
            shown_value(&folder.to_string_lossy())
        ),
        confirm_label: "Open Terminal".to_string(),
    }
}

/// Refuses a session command until the person has said yes to a terminal in
/// this app run. Sessions are only ever made by [`terminal_create_session`],
/// so an id that exists was made after that yes.
fn terminal_opened_this_run() -> Result<(), String> {
    if TERMINAL_OPENED_THIS_RUN.load(std::sync::atomic::Ordering::SeqCst) {
        Ok(())
    } else {
        Err(NO_TERMINAL_OPENED.to_string())
    }
}

/// Opens a shell in the terminal panel. The panel is the person's own shell:
/// nothing typed there is filtered, so the first one of an app run is decided
/// in a native dialog that names the folder. A declined dialog is an error
/// that says so, and no session exists.
#[tauri::command]
pub async fn terminal_create_session(
    shell_type: String,
    cwd: Option<String>,
    app: AppHandle,
    state: State<'_, SessionManager>,
) -> Result<String, String> {
    tracing::info!("Creating terminal session with shell: {}", shell_type);

    let shell_type = parse_shell_type(&shell_type)?;
    let folder = session_folder(cwd)?;

    if !TERMINAL_OPENED_THIS_RUN.load(std::sync::atomic::Ordering::SeqCst) {
        let request = format!("open a terminal in {}", folder.display());
        let confirmed = TERMINAL_DECISIONS
            .confirm(&app, &request, open_terminal_question(&folder))
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(
                "No terminal was opened. You declined it in the system dialog.".to_string(),
            );
        }
        TERMINAL_OPENED_THIS_RUN.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    let session_id = state
        .create_session(shell_type, Some(folder.to_string_lossy().into_owned()))
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;

    tracing::info!("Created terminal session: {}", session_id);
    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_send_input(
    session_id: String,
    data: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    terminal_opened_this_run()?;

    // Generate correlation ID for request tracing
    let correlation_id = uuid::Uuid::new_v4().to_string();

    // Validate session_id format (prevent injection via session ID)
    if session_id.is_empty() || session_id.len() > 128 {
        tracing::warn!(
            correlation_id = %correlation_id,
            session_id_len = session_id.len(),
            "Invalid session_id length"
        );
        return Err("Invalid session_id: must be 1-128 characters".to_string());
    }

    // Validate session_id contains only safe characters (alphanumeric, dash, underscore)
    if !session_id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        tracing::warn!(
            correlation_id = %correlation_id,
            "Invalid session_id characters"
        );
        return Err("Invalid session_id: contains invalid characters".to_string());
    }

    // Validate data length to prevent DoS via large payloads
    const MAX_INPUT_SIZE: usize = 1024 * 1024; // 1MB max
    if data.len() > MAX_INPUT_SIZE {
        tracing::warn!(
            correlation_id = %correlation_id,
            data_size = data.len(),
            max_size = MAX_INPUT_SIZE,
            "Blocked oversized terminal input"
        );
        return Err(format!(
            "Input too large: {} bytes exceeds maximum of {} bytes",
            data.len(),
            MAX_INPUT_SIZE
        ));
    }

    state
        .send_input(&session_id, &data)
        .await
        .map_err(|e| format!("Failed to send input: {}", e))?;

    tracing::debug!(
        correlation_id = %correlation_id,
        session_id = %session_id,
        "Terminal input sent successfully"
    );

    Ok(())
}

// Terminal resize bounds constants
// These prevent potential issues with extreme terminal dimensions
const MIN_TERMINAL_COLS: u16 = 1;
const MIN_TERMINAL_ROWS: u16 = 1;
// Practical limits to prevent resource exhaustion
// (removed u16::MAX constants as they're redundant - u16 cannot exceed its max)
const PRACTICAL_MAX_COLS: u16 = 1000;
const PRACTICAL_MAX_ROWS: u16 = 500;

#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    terminal_opened_this_run()?;

    // Add bounds checking for terminal dimensions
    // Validate minimum bounds
    if cols < MIN_TERMINAL_COLS {
        return Err(format!(
            "Invalid terminal width: {}. Minimum is {}",
            cols, MIN_TERMINAL_COLS
        ));
    }
    if rows < MIN_TERMINAL_ROWS {
        return Err(format!(
            "Invalid terminal height: {}. Minimum is {}",
            rows, MIN_TERMINAL_ROWS
        ));
    }

    // Validate practical bounds and warn for impractical values
    // Note: Maximum u16 bounds removed as they were always-false comparisons
    if cols > PRACTICAL_MAX_COLS || rows > PRACTICAL_MAX_ROWS {
        tracing::warn!(
            session_id = %session_id,
            cols = cols,
            rows = rows,
            "Terminal resize with unusually large dimensions"
        );
    }

    state
        .resize_session(&session_id, cols, rows)
        .await
        .map_err(|e| format!("Failed to resize terminal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_kill(
    session_id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state
        .kill_session(&session_id)
        .await
        .map_err(|e| format!("Failed to kill terminal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_get_history(
    session_id: String,
    limit: Option<usize>,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    terminal_opened_this_run()?;
    let limit = limit.unwrap_or(50);
    let history =
        crate::features::terminal::session_manager::get_command_history(&app, &session_id, limit)
            .await
            .map_err(|e| format!("Failed to get history: {}", e))?;
    Ok(history)
}

#[tauri::command]
pub async fn terminal_ai_suggest_command(
    intent: String,
    shell_type: String,
    cwd: Option<String>,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    crate::ui::hooks::gate_user_prompt("terminal", &intent).await?;
    tracing::info!("AI suggesting command for intent: {}", intent);

    let command = ai_state
        .suggest_command(&intent, &shell_type, cwd.as_deref())
        .await
        .map_err(|e| format!("Failed to generate command: {}", e))?;

    tracing::info!("AI suggested: {}", command);
    Ok(command)
}

#[tauri::command]
pub async fn terminal_smart_commit(
    session_id: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    terminal_opened_this_run()?;
    tracing::info!("AI smart commit for session: {}", session_id);

    let result = ai_state
        .smart_commit(&session_id)
        .await
        .map_err(|e| format!("Smart commit failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn terminal_ai_suggest_improvements(
    command: String,
    shell_type: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<Option<String>, String> {
    tracing::info!("AI analyzing command: {}", command);

    let suggestions = ai_state
        .suggest_improvements(&command, &shell_type)
        .await
        .map_err(|e| format!("Failed to analyze command: {}", e))?;

    Ok(suggestions)
}

/// Clear command history in a terminal session
#[tauri::command]
pub async fn terminal_clear_history(
    session_id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    terminal_opened_this_run()?;
    tracing::info!("Clearing command history in session {}", session_id);

    state
        .clear_history(&session_id)
        .await
        .map_err(|e| format!("Failed to clear history: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_shell_type_supports_unix_shells() {
        assert!(matches!(parse_shell_type("zsh"), Ok(ShellType::Zsh)));
        assert!(matches!(parse_shell_type("bash"), Ok(ShellType::Bash)));
        assert!(matches!(parse_shell_type("fish"), Ok(ShellType::Fish)));
        assert!(matches!(parse_shell_type("sh"), Ok(ShellType::Sh)));
    }

    #[test]
    fn parse_shell_type_supports_windows_aliases() {
        assert!(matches!(
            parse_shell_type("powershell"),
            Ok(ShellType::PowerShell)
        ));
        assert!(matches!(
            parse_shell_type("pwsh"),
            Ok(ShellType::PowerShell)
        ));
        assert!(matches!(parse_shell_type("cmd"), Ok(ShellType::Cmd)));
        assert!(matches!(
            parse_shell_type("git-bash"),
            Ok(ShellType::GitBash)
        ));
    }

    #[test]
    fn parse_shell_type_rejects_invalid_values() {
        assert!(parse_shell_type("totally-invalid-shell").is_err());
    }

    #[test]
    fn the_question_names_the_folder_the_session_starts_in() {
        let folder = std::env::temp_dir()
            .canonicalize()
            .expect("the temporary folder");
        assert_eq!(
            session_folder(Some(folder.to_string_lossy().into_owned())),
            Ok(folder.clone())
        );
        assert_eq!(
            session_folder(None),
            Ok(std::env::current_dir().expect("this folder"))
        );
        assert_eq!(
            session_folder(Some("   ".to_string())),
            Ok(std::env::current_dir().expect("this folder"))
        );
        assert!(session_folder(Some("/no/such/folder/anywhere".to_string())).is_err());

        let question = open_terminal_question(&folder);
        assert!(question
            .body
            .contains(&shown_value(&folder.to_string_lossy())));
        assert!(question.body.contains("run as you, outside the sandbox"));
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
    }

    #[test]
    fn a_folder_name_cannot_add_lines_to_the_question() {
        let question =
            open_terminal_question(std::path::Path::new("/tmp/a\n\nAllow everything?\nb"));
        assert_eq!(question.body.lines().count(), 3);
    }

    #[test]
    fn nothing_reaches_a_session_before_the_first_terminal_is_opened() {
        let production = include_str!("terminal.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("production code");
        for command in [
            "pub async fn terminal_send_input(",
            "pub async fn terminal_resize(",
            "pub async fn terminal_get_history(",
            "pub async fn terminal_smart_commit(",
            "pub async fn terminal_clear_history(",
        ] {
            let body = production
                .split(command)
                .nth(1)
                .unwrap_or_else(|| panic!("{command} is missing"));
            let body = body.split("\n}\n").next().expect("a body");
            assert!(
                body.contains("terminal_opened_this_run()?;"),
                "{command} does not wait for the first terminal"
            );
        }
        assert!(
            !production.contains("validate_interactive_input"),
            "keystrokes in the person's own shell are not filtered"
        );
        assert!(
            !production.contains("#[tauri::command]\npub async fn execute_terminal_command"),
            "the page has no general shell command"
        );
    }
}
