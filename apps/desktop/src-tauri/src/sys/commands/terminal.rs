use crate::features::terminal::{
    detect_available_shells, get_default_shell, SessionManager, ShellInfo, ShellType, TerminalAI,
};
use crate::sys::security::command_validator::{
    validate_command, validate_interactive_input, ValidationConfig,
};
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
    stream_id: Option<String>,
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

#[tauri::command]
pub async fn execute_terminal_command(
    app: AppHandle,
    command: String,
    cwd: Option<String>,
    shell: Option<String>,
    stream_id: Option<String>,
    emit_events: Option<bool>,
    // AUDIT-TERMINAL-066 fix: Add timeout_ms parameter instead of hardcoded 60s
    timeout_ms: Option<u64>,
) -> Result<ExecuteResult, String> {
    use std::path::Path;
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    // Generate correlation ID for request tracing
    let correlation_id = uuid::Uuid::new_v4().to_string();

    tracing::info!(
        correlation_id = %correlation_id,
        command = %command,
        "Executing independent terminal command"
    );

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

    // AUDIT-FIX: Enforce user confirmation for dangerous commands
    if crate::sys::security::command_validator::requires_confirmation(&command) {
        let confirmation_args = serde_json::json!({
            "command": command,
            "cwd": cwd,
            "shell": shell,
        });

        crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "terminal_execute",
            &confirmation_args,
        )
        .await?;
    }

    if let Some(ref dir) = cwd {
        if !Path::new(dir).exists() {
            return Err(format!("Working directory does not exist: {}", dir));
        }
    }

    // AUDIT-TERMINAL-054 fix: Use system default shell instead of hardcoded powershell/bash
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

    // AUDIT-TERMINAL-065/068 fix: Proper shell routing that honors requested shell
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
            if cfg!(target_os = "windows") {
                ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
            } else {
                // Git Bash is Windows-specific; fall back to bash on non-Windows
                ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
            }
        }
        "powershell" | "pwsh" => (
            if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
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
            // AUDIT-TERMINAL-068 fix: Don't silently fall back to powershell.exe on non-Windows
            // Use system default shell for unknown shells instead
            match get_default_shell() {
                ShellType::PowerShell => (
                    if cfg!(target_os = "windows") {
                        "powershell.exe".to_string()
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
                    ("bash".to_string(), vec!["-lc".to_string(), command.clone()])
                }
            }
        }
    };

    let mut cmd = Command::new(&program);
    for arg in &args {
        cmd.arg(arg);
    }

    if let Some(ref path) = cwd {
        cmd.current_dir(path);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

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

    // AUDIT-TERMINAL-066 fix: Use configurable timeout instead of hardcoded 60s
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

    Ok(ExecuteResult {
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
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

#[tauri::command]
pub async fn terminal_create_session(
    shell_type: String,
    cwd: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<String, String> {
    tracing::info!("Creating terminal session with shell: {}", shell_type);

    let shell_type = parse_shell_type(&shell_type)?;

    let session_id = state
        .create_session(shell_type, cwd)
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

    // SECURITY FIX: Apply command validation to interactive sessions too
    // This prevents the security bypass where dangerous commands could be
    // executed through interactive mode without validation
    if let Err(e) = validate_interactive_input(&data, Some(&correlation_id)) {
        tracing::warn!(
            correlation_id = %correlation_id,
            session_id = %session_id,
            error = %e,
            "Interactive input validation failed - blocking dangerous command"
        );
        return Err(format!("Command blocked for security: {}", e));
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

// AUDIT-003-010 fix: Terminal resize bounds constants
// These prevent potential issues with extreme terminal dimensions
const MIN_TERMINAL_COLS: u16 = 1;
const MIN_TERMINAL_ROWS: u16 = 1;
// AUDIT-P3-012: Practical limits to prevent resource exhaustion
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
    // AUDIT-003-010 fix: Add bounds checking for terminal dimensions
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

    // AUDIT-P3-012: Validate practical bounds and warn for impractical values
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
pub async fn terminal_list_sessions(
    state: State<'_, SessionManager>,
) -> Result<Vec<String>, String> {
    let sessions = state.list_sessions().await;
    Ok(sessions)
}

#[tauri::command]
pub async fn terminal_get_history(
    session_id: String,
    limit: Option<usize>,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
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
    tracing::info!("AI suggesting command for intent: {}", intent);

    let command = ai_state
        .suggest_command(&intent, &shell_type, cwd.as_deref())
        .await
        .map_err(|e| format!("Failed to generate command: {}", e))?;

    tracing::info!("AI suggested: {}", command);
    Ok(command)
}

#[tauri::command]
pub async fn terminal_ai_explain_error(
    error_output: String,
    command: Option<String>,
    shell_type: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    tracing::info!("AI explaining error");

    let explanation = ai_state
        .explain_error(&error_output, command.as_deref(), &shell_type)
        .await
        .map_err(|e| format!("Failed to explain error: {}", e))?;

    Ok(explanation)
}

#[tauri::command]
pub async fn terminal_smart_commit(
    session_id: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
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

/// Set an environment variable in a terminal session
#[tauri::command]
pub async fn terminal_set_env(
    session_id: String,
    key: String,
    value: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    tracing::info!(
        "Setting environment variable {} in session {}",
        key,
        session_id
    );

    state
        .set_env(&session_id, &key, &value)
        .await
        .map_err(|e| format!("Failed to set environment variable: {}", e))?;

    Ok(())
}

/// Get an environment variable from a terminal session
#[tauri::command]
pub async fn terminal_get_env(
    session_id: String,
    key: String,
    state: State<'_, SessionManager>,
) -> Result<Option<String>, String> {
    tracing::debug!(
        "Getting environment variable {} from session {}",
        key,
        session_id
    );

    state
        .get_env(&session_id, &key)
        .await
        .map_err(|e| format!("Failed to get environment variable: {}", e))
}

/// List all environment variables in a terminal session
#[tauri::command]
pub async fn terminal_list_env(
    session_id: String,
    state: State<'_, SessionManager>,
) -> Result<Vec<(String, String)>, String> {
    tracing::debug!("Listing environment variables in session {}", session_id);

    state
        .list_env(&session_id)
        .await
        .map_err(|e| format!("Failed to list environment variables: {}", e))
}

/// Unset an environment variable in a terminal session
#[tauri::command]
pub async fn terminal_unset_env(
    session_id: String,
    key: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    tracing::info!(
        "Unsetting environment variable {} in session {}",
        key,
        session_id
    );

    state
        .unset_env(&session_id, &key)
        .await
        .map_err(|e| format!("Failed to unset environment variable: {}", e))?;

    Ok(())
}

/// Clear command history in a terminal session
#[tauri::command]
pub async fn terminal_clear_history(
    session_id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
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
}
