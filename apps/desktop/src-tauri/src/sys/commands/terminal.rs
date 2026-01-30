use crate::features::terminal::{
    detect_available_shells, SessionManager, ShellInfo, ShellType, TerminalAI,
};
use crate::sys::security::command_validator::{
    validate_command, validate_interactive_input, ValidationConfig,
};
use std::time::Instant;
use tauri::State;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
}

#[tauri::command]
pub async fn execute_terminal_command(
    command: String,
    cwd: Option<String>,
    shell: Option<String>,
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

    if let Some(ref dir) = cwd {
        if !Path::new(dir).exists() {
            return Err(format!("Working directory does not exist: {}", dir));
        }
    }

    let shell = shell.unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            "powershell".to_string()
        } else {
            "bash".to_string()
        }
    });

    let (program, args): (String, Vec<String>) = match shell.to_lowercase().as_str() {
        "cmd" => (
            "cmd.exe".to_string(),
            vec!["/C".to_string(), command.clone()],
        ),
        "bash" | "sh" | "zsh" => {
            let shell_path = if cfg!(target_os = "macos") {
                "/bin/zsh".to_string()
            } else {
                "/bin/bash".to_string()
            };
            (shell_path, vec!["-lc".to_string(), command.clone()])
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
            if cfg!(target_os = "windows") {
                (
                    "powershell.exe".to_string(),
                    vec!["-Command".to_string(), command.clone()],
                )
            } else {
                (
                    "/bin/sh".to_string(),
                    vec!["-c".to_string(), command.clone()],
                )
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

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stdout) = stdout_handle {
            let _ = stdout.read_to_end(&mut buffer).await;
        }
        buffer
    });

    let stderr_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stderr) = stderr_handle {
            let _ = stderr.read_to_end(&mut buffer).await;
        }
        buffer
    });

    let timeout_duration = tokio::time::Duration::from_secs(60);
    let status = match tokio::time::timeout(timeout_duration, child.wait()).await {
        Ok(result) => result.map_err(|e| format!("Command failed: {}", e))?,
        Err(_) => {
            let _ = child.kill().await;
            return Err("Command timed out after 60 seconds".to_string());
        }
    };

    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_bytes = stderr_task.await.unwrap_or_default();
    let duration = start_time.elapsed();

    Ok(ExecuteResult {
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
        exit_code: status.code(),
        duration_ms: duration.as_millis() as u64,
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

    let shell_type = match shell_type.to_lowercase().as_str() {
        "powershell" => ShellType::PowerShell,
        "cmd" => ShellType::Cmd,
        "wsl" => ShellType::Wsl,
        "gitbash" => ShellType::GitBash,
        _ => return Err(format!("Invalid shell type: {}", shell_type)),
    };

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
